import { QUEUE_CAP, SYNC_BATCH_MAX } from "../shared/constants";
import { getState, patchState } from "../storage/store";
import { apiTransport } from "./api-transport";
import { localTransport } from "./local-transport";
import { findingKey, type Finding, type FindingTransport } from "./types";

// The finding queue. Tools call enqueue(); flush() walks transports in
// priority order (local HUD bridge first when it exists, then the website
// API). Dedupe is by (type, subject, day) so revisiting a product ten times
// a day syncs once.

const TRANSPORTS: FindingTransport[] = [localTransport, apiTransport];

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
  let anyAvailable = false;
  let anyRetryable = false;
  let deliveredSomewhere = false;
  for (const transport of TRANSPORTS) {
    if (!(await transport.isAvailable())) continue;
    anyAvailable = true;
    const result = await transport.send(batch);
    if (result.ok) deliveredSomewhere = true;
    else if (result.retry) anyRetryable = true;
    // A non-retryable failure (for example a revoked key) is unrecoverable for
    // that sink; it does not hold the batch.
  }

  if (!anyAvailable) return; // no sink up right now; keep the queue for next alarm
  if (anyRetryable) return; // a sink wants a retry; keep the batch (idempotent re-send)

  // Every available sink either accepted or permanently rejected the batch: drop
  // it so the queue cannot wedge, and stamp the sync time if anything took it.
  await patchState((s) => {
    const done = new Set(batch.map(findingKey));
    s.queue = s.queue.filter((f) => !done.has(findingKey(f)));
    if (deliveredSomewhere) s.lastSyncAt = Date.now();
  });
}

export async function queueDepth(): Promise<number> {
  return (await getState()).queue.length;
}
