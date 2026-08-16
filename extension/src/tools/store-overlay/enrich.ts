import type { DpStaticSignals } from "../../amazon/dp-static";
import { getCachedDpBatch } from "../../amazon/dp-cache";
import { enrichOne } from "../../amazon/dp-enrich";
import { log } from "../../shared/log";

// Tier-1 enrichment for the store overlay: fetch each tile's product page
// once (static HTML, no JS) and read the video-slot and demand signals off
// it. Cache-first so a revisit paints instantly; the misses go through the
// shared sequential fetcher (2.5-4s jitter) so ~20 products take about a
// minute the first time. Stops outright on a robot-check page or repeated
// fetch failures rather than hammering Amazon. The fetch/parse/cache body
// lives in src/amazon/dp-enrich.ts, shared with the search overlay.

// Consecutive failed fetches before the run gives up (the throttle observed
// live manifests as a rejected fetch, not a block page).
const FAIL_GIVE_UP = 3;

export type EnrichOutcome = {
  asin: string;
  signals: DpStaticSignals | null;
  fromCache: boolean;
};

export async function enrichStoreTiles(opts: {
  asins: string[];
  origin: string;
  marketplace: string;
  signal: AbortSignal;
  onResult: (outcome: EnrichOutcome) => void;
  onProgress: (done: number, total: number) => void;
}): Promise<{ blocked: boolean }> {
  const keys = opts.asins.map((asin) => `${opts.marketplace}:${asin}`);
  const cached = await getCachedDpBatch(keys);
  if (opts.signal.aborted) return { blocked: false };

  const misses: string[] = [];
  for (const asin of opts.asins) {
    const hit = cached.get(`${opts.marketplace}:${asin}`);
    if (hit) {
      opts.onResult({ asin, signals: hit, fromCache: true });
    } else {
      misses.push(asin);
    }
  }

  let done = 0;
  let failures = 0;
  opts.onProgress(done, misses.length);
  for (const asin of misses) {
    if (opts.signal.aborted) break;
    const result = await enrichOne({
      asin,
      origin: opts.origin,
      marketplace: opts.marketplace,
      signal: opts.signal,
    });
    if (opts.signal.aborted) break;
    if (result.blocked) {
      log("store-overlay", "robot check page; pausing enrichment");
      return { blocked: true };
    }
    if (result.failed) {
      failures += 1;
      log("store-overlay", `dp fetch failed for ${asin}`);
      opts.onProgress(++done, misses.length);
      if (failures >= FAIL_GIVE_UP) return { blocked: true };
      continue;
    }
    failures = 0;
    opts.onResult({ asin, signals: result.signals, fromCache: false });
    opts.onProgress(++done, misses.length);
  }
  return { blocked: false };
}
