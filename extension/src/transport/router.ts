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
  for (const transport of TRANSPORTS) {
    if (!(await transport.isAvailable())) continue;
    const result = await transport.send(batch);
    if (result.ok) {
      await patchState((s) => {
        const sent = new Set(batch.map(findingKey));
        s.queue = s.queue.filter((f) => !sent.has(findingKey(f)));
        s.lastSyncAt = Date.now();
      });
      return;
    }
    if (!result.retry) {
      // Permanent failure (for example a revoked key): drop the batch so the
      // queue cannot wedge, the next scans will re-emit fresh findings.
      await patchState((s) => {
        const dropped = new Set(batch.map(findingKey));
        s.queue = s.queue.filter((f) => !dropped.has(findingKey(f)));
      });
      return;
    }
    // retryable: leave the queue intact for the next alarm
  }
}

export async function queueDepth(): Promise<number> {
  return (await getState()).queue.length;
}
