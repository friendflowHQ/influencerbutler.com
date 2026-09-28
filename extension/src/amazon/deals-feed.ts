// The deal records captured from amazon.com/deals by the MAIN-world deals hook
// (src/content/deals-hook.ts). The Today's Deals grid is a React app that never
// puts the ASIN in the tile DOM (the cards link to javascript:void(0) and open
// an in-page overlay), so unlike search / best-sellers / idea-list there is no
// data-asin or /dp/ href to read. The hook instead observes the page's own
// fetch/XHR traffic and republishes the ASIN + image + price it carries; this
// module is the isolated-world side that accumulates those records so the deals
// overlay can join them back to the rendered tiles (by image, see deals-tiles).

export type DealsFeedItem = {
  asin: string;
  // The product image URL from the feed, used to match the record to its
  // rendered tile. Null when the payload carried only the ASIN (e.g. the
  // products batch URL, whose path lists ASINs but no images).
  imageUrl: string | null;
  title: string | null;
  priceCents: number | null;
  currency: string;
};

// Accumulated across every hook emission this page view, keyed by ASIN so a
// later batch (the grid pages in more deals as the user scrolls / filters)
// tops up rather than replaces, and a record that first arrives ASIN-only is
// upgraded in place once a richer payload for the same ASIN lands.
const byAsin = new Map<string, DealsFeedItem>();

export function setDealsFeed(items: DealsFeedItem[]): void {
  for (const item of items) {
    const asin = item.asin.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const prev = byAsin.get(asin);
    byAsin.set(asin, {
      asin,
      // Prefer any non-null field over a previously stored null, so an ASIN-only
      // record does not clobber image/price a richer payload already supplied.
      imageUrl: item.imageUrl ?? prev?.imageUrl ?? null,
      title: item.title ?? prev?.title ?? null,
      priceCents: item.priceCents ?? prev?.priceCents ?? null,
      currency: item.currency || prev?.currency || "USD",
    });
  }
}

export function getDealsFeed(): DealsFeedItem[] {
  return Array.from(byAsin.values());
}

export function dealsFeedSize(): number {
  return byAsin.size;
}

// The stable image id inside an Amazon media URL, used as the join key between a
// feed record and a rendered tile's <img>. Amazon serves the same product photo
// under one id with different size suffixes
// (".../images/I/71abcXYZ._AC_UL320_.jpg"), so the id before the first "." is
// what two URLs for the same product share. Returns null for a non-media URL.
export function imageIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/images\/I\/([^./]+)/);
  return match?.[1] ?? null;
}
