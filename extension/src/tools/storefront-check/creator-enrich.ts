import { sendToBackground } from "../../shared/messages";
import type { EnrichedProduct, EnrichResult } from "../../shared/messages";

// Opt-in Creator API (PA-API) pass for the storefront checkup. Batches unique
// tagged ASINs into PA-API pages (<=10) and routes each through the background
// worker, which holds the license key and does the signed server call. Runs
// sequentially with a gentle pace because PA-API's per-second throughput is
// low; the server also fans out sequentially across marketplaces.

const BATCH = 10;
const BATCH_DELAY_MS = 1100;

export type CreatorEnrichResult = {
  // false only when the user has no Creator API credentials stored, so the
  // panel can prompt them; a per-batch network error does not flip this.
  configured: boolean;
  byAsin: Map<string, EnrichedProduct>;
};

export async function enrichWithCreatorApi(
  asins: string[],
  marketplaceHost: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<CreatorEnrichResult> {
  const byAsin = new Map<string, EnrichedProduct>();
  const unique = [...new Set(asins)];
  const host = marketplaceHost.replace(/^www\./, "");
  let configured = false;

  for (let i = 0; i < unique.length; i += BATCH) {
    signal.throwIfAborted();
    const chunk = unique.slice(i, i + BATCH);
    const res: EnrichResult = await sendToBackground({
      kind: "ENRICH_PRODUCTS",
      asins: chunk,
      marketplaces: [host],
    });
    if (res.ok) {
      // No credentials at all: stop early, the whole pass is a no-op.
      if (!res.configured) return { configured: false, byAsin };
      configured = true;
      for (const entry of res.items) {
        const row = pickRow(entry.results, host);
        if (row) byAsin.set(entry.asin, row);
      }
    }
    // A failed batch (network/throttle) is skipped, not fatal: keep going so a
    // single hiccup does not lose the rest of the enrichment.
    onProgress(Math.min(i + BATCH, unique.length), unique.length);
    if (i + BATCH < unique.length) await sleep(BATCH_DELAY_MS, signal);
  }

  return { configured, byAsin };
}

// Prefer the found row for this marketplace; fall back to any found row, then
// to the first row so an error message can still surface downstream.
function pickRow(rows: EnrichedProduct[], host: string): EnrichedProduct | null {
  return (
    rows.find((r) => r.found && r.marketplace === host) ??
    rows.find((r) => r.found) ??
    rows[0] ??
    null
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
