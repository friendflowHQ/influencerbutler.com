import { getCachedDpBatch } from "../../amazon/dp-cache";
import { enrichOne, isCoolingDown } from "../../amazon/dp-enrich";
import type { DpStaticSignals } from "../../amazon/dp-static";
import { log } from "../../shared/log";

// Automatic tier-1 enrichment for the search overlay: cached signals paint
// immediately, then only the tiles the user actually scrolls into view get a
// static product-page fetch, through the shared serialized fetcher. A search
// page can hold 20+ tiles and Amazon rewrites it on every filter click, so
// the fetch budget is capped per run and a robot-check pauses everything via
// the shared cooldown in dp-enrich.ts.

// Network fetches allowed per page view (cache hits are free and uncounted).
const FETCH_CAP = 24;
// Consecutive failed fetches before the run gives up quietly.
const FAIL_GIVE_UP = 3;

export async function enrichSearchTiles(opts: {
  items: Array<{ asin: string; el: HTMLElement }>;
  origin: string;
  marketplace: string;
  signal: AbortSignal;
  onSignals: (asin: string, signals: DpStaticSignals) => void;
  // done/total count network fetches only; paused means a robot check (or an
  // active cooldown) stopped the run early.
  onStatus: (done: number, total: number, paused: boolean) => void;
}): Promise<void> {
  const keys = opts.items.map((i) => `${opts.marketplace}:${i.asin}`);
  const cached = await getCachedDpBatch(keys);
  if (opts.signal.aborted) return;

  const pending: Array<{ asin: string; el: HTMLElement }> = [];
  for (const item of opts.items) {
    const hit = cached.get(`${opts.marketplace}:${item.asin}`);
    if (hit) {
      opts.onSignals(item.asin, hit);
    } else {
      pending.push(item);
    }
  }
  if (pending.length === 0) return;
  if (isCoolingDown()) {
    opts.onStatus(0, pending.length, true);
    return;
  }

  const queue: string[] = [];
  const queued = new Set<string>();
  let draining = false;
  let done = 0;
  let fetched = 0;
  let failures = 0;
  let stopped = false;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const item = pending.find((p) => p.el === entry.target);
      if (item && !queued.has(item.asin)) {
        queued.add(item.asin);
        queue.push(item.asin);
      }
    }
    void drain();
  });
  opts.signal.addEventListener("abort", () => observer.disconnect(), { once: true });

  const drain = async (): Promise<void> => {
    if (draining || stopped) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (opts.signal.aborted || stopped) break;
        if (isCoolingDown()) {
          stop(true);
          break;
        }
        if (fetched >= FETCH_CAP) {
          // Budget spent: leave the rest unenriched rather than hammering
          // Amazon from a page the user is just scrolling.
          log("search-overlay", `enrich fetch cap (${FETCH_CAP}) reached`);
          stop(false);
          break;
        }
        const asin = queue.shift();
        if (!asin) break;
        fetched += 1;
        const result = await enrichOne({
          asin,
          origin: opts.origin,
          marketplace: opts.marketplace,
          signal: opts.signal,
        });
        if (opts.signal.aborted) break;
        if (result.blocked) {
          log("search-overlay", "robot check page; pausing enrichment");
          stop(true);
          break;
        }
        if (result.failed) {
          failures += 1;
          done += 1;
          opts.onStatus(done, pending.length, false);
          if (failures >= FAIL_GIVE_UP) {
            stop(true);
            break;
          }
          continue;
        }
        failures = 0;
        done += 1;
        if (result.signals) opts.onSignals(asin, result.signals);
        opts.onStatus(done, pending.length, false);
      }
      // Queue idle (waiting for more tiles to scroll into view, or finished):
      // clear the progress line instead of looking stuck mid-count.
      if (!stopped && queue.length === 0) opts.onStatus(done, done, false);
    } finally {
      draining = false;
    }
  };

  const stop = (paused: boolean): void => {
    stopped = true;
    observer.disconnect();
    queue.length = 0;
    if (paused) opts.onStatus(done, pending.length, true);
  };

  for (const item of pending) observer.observe(item.el);
}
