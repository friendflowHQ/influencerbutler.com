import { getCache, loadFilters, membership } from "../catalogue/cache";
import { lookupCcRates } from "./cc-rates";
import { enrichProducts } from "./enrich";
import { backfillWatchItem } from "./watchlist";
import { backfillProductListItem } from "./product-lists";
import type { RowBadge, RowBadgesResult, RowEnrichRef } from "../shared/messages";

// Popup row enrichment. The Watchlist and My Lists cards render a thumbnail plus
// the CC / SPCC / commission signals the desktop Orders Butler shows. Each of
// those pieces already exists on its own; this merges them into one batch so the
// popup makes a single call:
//   - CC / SPCC membership: local bloom filters (no network).
//   - CC commission %: server join, only for ASINs the bloom says are CC.
//   - image / title: Creator API lookup, only for rows missing them, and the
//     result is written back into the store so the next open is instant.
// The Creator API is license-gated; when the user is not signed in the image and
// title stay null and the row still shows its chips from the local catalogue.

// The Creator API caps a batch at ten ASINs; chunk to stay under it.
const ENRICH_BATCH = 10;

const ASIN_RE = /^[A-Z0-9]{10}$/;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function enrichRows(refs: RowEnrichRef[]): Promise<RowBadgesResult> {
  const badges: Record<string, RowBadge> = {};

  const cache = await getCache();
  const loaded = loadFilters(cache);
  const asins = Array.from(
    new Set(refs.map((r) => r.asin.toUpperCase()).filter((a) => ASIN_RE.test(a))),
  );
  if (asins.length === 0) return { badges };

  for (const asin of asins) {
    const m = membership(loaded, asin);
    badges[asin] = { cc: m.cc, spcc: m.spcc, ratePct: null, imageUrl: null, title: null };
  }

  // Real commission % only for CC members (mirrors cc-rates.ts's own rule that
  // callers ask only for ASINs the bloom already flagged).
  const ccMembers = asins.filter((a) => badges[a]?.cc);
  if (ccMembers.length > 0) {
    const { rates } = await lookupCcRates(ccMembers);
    for (const [asin, rate] of Object.entries(rates)) {
      const badge = badges[asin.toUpperCase()];
      if (badge) badge.ratePct = rate.ratePct;
    }
  }

  // Image / title for rows that lack them, grouped by marketplace so each ASIN
  // comes back as one row for its own store.
  const needImage = refs.filter((r) => r.needsImage && ASIN_RE.test(r.asin.toUpperCase()));
  const byMarket = new Map<string, string[]>();
  for (const ref of needImage) {
    const asin = ref.asin.toUpperCase();
    const arr = byMarket.get(ref.marketplace) ?? [];
    if (!arr.includes(asin)) arr.push(asin);
    byMarket.set(ref.marketplace, arr);
  }

  for (const [marketplace, marketAsins] of byMarket) {
    for (const batch of chunk(marketAsins, ENRICH_BATCH)) {
      const res = await enrichProducts(batch, [marketplace]);
      if (!res.ok) continue;
      for (const entry of res.items) {
        const asin = entry.asin.toUpperCase();
        const badge = badges[asin];
        if (!badge) continue;
        const best = entry.results.find((r) => r.found) ?? entry.results[0];
        if (!best) continue;
        if (best.imageUrl) badge.imageUrl = best.imageUrl;
        if (best.title) badge.title = best.title;
      }
    }
  }

  // Persist what we fetched so the row keeps its image/title without another
  // lookup, and so it survives even if the user later signs out.
  for (const ref of needImage) {
    const badge = badges[ref.asin.toUpperCase()];
    if (!badge || (!badge.imageUrl && !badge.title)) continue;
    if (ref.source === "watchlist") {
      await backfillWatchItem(ref.asin, ref.marketplace, {
        imageUrl: badge.imageUrl,
        title: badge.title,
      });
    } else if (ref.source === "list" && ref.listId) {
      await backfillProductListItem(ref.listId, ref.asin, ref.marketplace, {
        imageUrl: badge.imageUrl,
        title: badge.title,
      });
    }
  }

  return { badges };
}
