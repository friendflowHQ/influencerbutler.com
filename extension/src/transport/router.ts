import { QUEUE_CAP, SYNC_BATCH_MAX } from "../shared/constants";
import { getState, patchState } from "../storage/store";
import { apiTransport } from "./api-transport";
import { localTransport } from "./local-transport";
import { relayTransport } from "./relay-transport";
import { findingKey, type Finding, type FindingTransport } from "./types";

// The finding queue. Tools call enqueue(); flush() walks transports in
// priority order: the local HUD bridge when it exists, the website API always,
// and the cross-device relay when the app is on another machine (or phone) with
// no local app here. Dedupe is by (type, subject, day) so revisiting a product
// ten times a day syncs once. relayTransport self-suppresses when the local app
// is present, so on a same-machine setup only local + API run.

const TRANSPORTS: FindingTransport[] = [localTransport, apiTransport, relayTransport];

export async function enqueue(finding: Finding): Promise<void> {
  await patchState((state) => {
    const key = findingKey(finding);
    const existingIndex = state.queue.findIndex((f) => findingKey(f) === key);
    if (existingIndex >= 0) {
      state.queue[existingIndex] = finding; // refresh with the newest data
    } else {
      state.queue.push(finding);
      if (state.queue.length > QUEUE_CAP) {
        state.queue.splice(0, state.queue.length - QUEUE_CAP);
      }
    }
  });
}

export async function flush(): Promise<void> {
  const state = await getState();
  if (state.queue.length === 0) return;

  const batch = state.queue.slice(0, SYNC_BATCH_MAX);

  // Dual-send: deliver the batch to every available sink (the HUD local bridge
  // and the website API), not just the first that answers, so findings reach the
  // app AND the dashboard when both are up. Re-delivery on a retry is safe: both
  // sinks upsert by a stable key, so a finding seen twice updates in place.
  //
  // The drain decision follows the DURABLE sinks only (the website dashboard and
  // a linked device). A best-effort sink (the local HUD mirror) is still sent to
  // opportunistically, but its retry never holds the queue: a busy desktop app
  // that keeps asking to retry used to wedge every finding here, so the dashboard
  // count sat at "N waiting to sync" forever even though the dashboard sync is
  // meant to be app-independent.
  let anyDurableAvailable = false;
  let anyDurableRetryable = false;
  let anyBestEffortAvailable = false;
  let bestEffortDelivered = false;
  let deliveredSomewhere = false;
  let durableError: string | null = null;
  for (const transport of TRANSPORTS) {
    if (!(await transport.isAvailable())) continue;
    const result = await transport.send(batch);
    if (result.ok) deliveredSomewhere = true;
    if (!transport.bestEffort && result.error) durableError = `${transport.id}: ${result.error}`;
    if (transport.bestEffort) {
      anyBestEffortAvailable = true;
      if (result.ok) bestEffortDelivered = true;
      continue; // a best-effort sink never holds the queue
    }
    anyDurableAvailable = true;
    if (!result.ok && result.retry) anyDurableRetryable = true;
    // A durable non-retryable failure (for example a revoked key, or a payload
    // the server permanently rejects) is unrecoverable; it does not hold the
    // batch either.
  }

  await recordSyncError(durableError);

  if (anyDurableAvailable) {
    // The website dashboard / a linked device is the system of record: keep the
    // batch only when one of them still wants a retry.
    if (anyDurableRetryable) return;
  } else {
    // No durable sink up right now. Fall back to best-effort delivery (the HUD
    // mirror, e.g. paired-but-signed-out): drop only once it actually took the
    // batch, otherwise keep it for the next alarm.
    if (!(anyBestEffortAvailable && bestEffortDelivered)) return;
  }

  // The batch is delivered (or permanently rejected) everywhere that counts:
  // drop it so the queue cannot wedge, and stamp the sync time if anything took
  // it.
  await patchState((s) => {
    const done = new Set(batch.map(findingKey));
    s.queue = s.queue.filter((f) => !done.has(findingKey(f)));
    if (deliveredSomewhere) s.lastSyncAt = Date.now();
  });
}

// Remember why the last durable send failed (cleared on success) so the popup can
// say which endpoint is holding the queue. Writes only on a change, so a steady
// failure does not rewrite storage every 2 minutes.
async function recordSyncError(message: string | null): Promise<void> {
  const current = (await getState()).lastSyncError ?? null;
  if ((current?.message ?? null) === message) return;
  await patchState((s) => {
    s.lastSyncError = message ? { at: Date.now(), message } : null;
  });
}

export async function queueDepth(): Promise<number> {
  return (await getState()).queue.length;
}
