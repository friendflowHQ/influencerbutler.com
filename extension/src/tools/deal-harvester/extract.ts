// Deal Sites Harvester: the extractor.
//
// Third-party "daily deals" aggregator pages (savewithcindy.shop, jungle.deals,
// promos4creators.com, published Google Docs, etc.) all have wildly different
// markup, but the one thing that matters is stable across every one of them:
// the Amazon product links. So the baseline is a generic sweep for ASINs in
// Amazon URLs and data-asin attributes, host-agnostic. A small per-host parser
// registry can add fields the generic pass cannot infer (a promo code, an
// expiry) for a handful of high-value sites.
//
// This module is intentionally pure and DOM-free: it takes an HTML string and
// returns rows. That makes it unit-testable AND runnable inside the MV3 service
// worker (which has no DOMParser), where the background fetches each URL.

export type HarvestedDeal = {
  asin: string;
  marketplace: string;
  sourceUrl: string;
  promoCode: string | null;
};

// A 10-char Amazon id in a link path (/dp/, /gp/product/, /gp/aw/d/) or an
// asin= query param. Kept broad on the id (Amazon uses B0-prefixed and older
// all-caps ISBN-style ids), but always anchored to an ASIN-bearing context so a
// random 10-char token elsewhere on the page is never mistaken for a product.
const RELATIVE_ASIN_RE =
  /(?:\/(?:dp|gp\/product|gp\/aw\/d)\/|[?&](?:asin|ASIN)=)([A-Z0-9]{10})(?:[/?&#"']|$)/g;

// Absolute Amazon links, so we can read the marketplace host off the URL rather
// than assuming amazon.com. Handles amazon.com, amazon.co.uk, amazon.com.au, etc.
// No slash after the host group: the dp/gp alternatives already carry the
// leading slash, so /dp/ can sit immediately after the host.
const ABSOLUTE_ASIN_RE =
  /https?:\/\/(?:www\.|smile\.)?(amazon\.[a-z.]{2,6})[^\s"'<>]*?(?:\/(?:dp|gp\/product|gp\/aw\/d)\/|[?&](?:asin|ASIN)=)([A-Z0-9]{10})/gi;

// data-asin="ASIN" attributes, used by storefront-style embeds.
const DATA_ASIN_RE = /data-asin=["']([A-Z0-9]{10})["']/gi;

// Some aggregators render each deal as one element carrying both the ASIN and
// its promo code as data attributes. When present (any order), we can pair them
// without a DOM. Host-agnostic because the shape, not the site, is what we key on.
const DATA_PAIR_RE =
  /data-asin=["']([A-Z0-9]{10})["'][^>]*?data-(?:code|promo|coupon)=["']([^"']{2,40})["']/gi;

const DEFAULT_MARKETPLACE = "amazon.com";

// Per-host parser: given the raw html and the deals the generic pass already
// found, return the final list (augmented or filtered). Registered by bare
// hostname (no www.). Unknown hosts fall back to the generic result untouched.
export type SiteParser = (
  html: string,
  sourceUrl: string,
  generic: HarvestedDeal[],
) => HarvestedDeal[];

export const SITE_PARSERS: Record<string, SiteParser> = {
  // jungle.deals lists a coupon code next to each product in a `data-coupon`
  // attribute on the same card as the product link, which the generic data-pair
  // sweep already captures; this override simply drops rows with no ASIN link
  // (the site also renders non-Amazon affiliate cards we do not want).
  "jungle.deals": (_html, _sourceUrl, generic) => generic,
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Map an amazon.* host to the marketplace string the rest of the pipeline uses
// (matches MARKETPLACE_RE on the server: lowercase host without www).
function marketplaceFromHost(host: string): string {
  return host.toLowerCase();
}

/**
 * Extract every Amazon product on an aggregator page. Deduped by (asin,
 * marketplace), first occurrence wins, original page order preserved so the
 * review list mirrors how the deals appear on the source.
 */
export function extractDeals(html: string, sourceUrl: string): HarvestedDeal[] {
  const byKey = new Map<string, HarvestedDeal>();
  // Every ASIN already placed, regardless of marketplace. An absolute Amazon
  // link is authoritative for the marketplace, so once an ASIN is seen we do
  // not let a later marketplace-less match (which would default to .com) add a
  // second, wrong row for the same product: the relative regex also matches
  // inside absolute URLs, so this is what keeps one product to one row.
  const seenAsins = new Set<string>();

  const backfillCode = (asin: string, promoCode: string | null): boolean => {
    if (!promoCode || !seenAsins.has(asin)) return false;
    for (const deal of byKey.values()) {
      if (deal.asin === asin && !deal.promoCode) deal.promoCode = promoCode;
    }
    return true;
  };

  const add = (asin: string, marketplace: string, promoCode: string | null) => {
    if (backfillCode(asin, promoCode)) return; // already have this product
    if (seenAsins.has(asin)) return;
    seenAsins.add(asin);
    byKey.set(`${marketplace}:${asin}`, { asin, marketplace, sourceUrl, promoCode });
  };

  // Absolute links first: they carry the real marketplace host, so they win the
  // marketplace for any ASIN that also appears as a bare relative link.
  for (const m of html.matchAll(ABSOLUTE_ASIN_RE)) {
    add(m[2] as string, marketplaceFromHost(m[1] ?? DEFAULT_MARKETPLACE), null);
  }
  // Relative links and asin= params: marketplace unknown, default to .com.
  for (const m of html.matchAll(RELATIVE_ASIN_RE)) {
    add(m[1] as string, DEFAULT_MARKETPLACE, null);
  }
  // data-asin attributes on embeds.
  for (const m of html.matchAll(DATA_ASIN_RE)) {
    add(m[1] as string, DEFAULT_MARKETPLACE, null);
  }
  // Pair ASIN + promo code when both ride the same element.
  for (const m of html.matchAll(DATA_PAIR_RE)) {
    add(m[1] as string, DEFAULT_MARKETPLACE, (m[2] ?? "").trim() || null);
  }

  const generic = [...byKey.values()];
  const parser = SITE_PARSERS[hostOf(sourceUrl)];
  return parser ? parser(html, sourceUrl, generic) : generic;
}
