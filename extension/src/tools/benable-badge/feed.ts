import { buildIndex, normalizeTitle, type BenableIndex, type BenableRec } from "./model";

// Isolated-world side of the Benable rec feed: accumulates the Amazon items the
// MAIN-world hook (src/content/benable-hook.ts) republishes and exposes an index
// so the overlay can join each rendered card to its rec. Mirrors the accumulate
// -then-join shape of src/amazon/deals-feed.ts.

const recs: BenableRec[] = [];
const seen = new Set<string>();
let index: BenableIndex = buildIndex([]);

export type { BenableRec } from "./model";

// Merge a hook emission. Deduped by ASIN + normalized title so the same list
// arriving twice (a re-emit, or an SPA revisit) tops up rather than duplicates.
export function setBenableFeed(incoming: BenableRec[]): void {
  let changed = false;
  for (const raw of incoming) {
    const asin = String(raw.asin || "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const rec: BenableRec = {
      asin,
      title: raw.title ?? null,
      photoIds: Array.isArray(raw.photoIds) ? raw.photoIds.map(String).filter(Boolean) : [],
    };
    const key = `${asin}|${normalizeTitle(rec.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push(rec);
    changed = true;
  }
  if (changed) index = buildIndex(recs);
}

export function benableFeedCount(): number {
  return recs.length;
}

export function benableIndex(): BenableIndex {
  return index;
}

// Cleared on SPA navigation to a different list so stale recs cannot mis-join a
// new list's cards.
export function resetBenableFeed(): void {
  recs.length = 0;
  seen.clear();
  index = buildIndex([]);
}
