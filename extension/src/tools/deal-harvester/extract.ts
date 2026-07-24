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

// Amazon short links (amzn.to, a.co, amzn.eu, amzn.asia). Deal sites use these
// heavily, and they carry no ASIN in the URL itself: the background must follow
// the redirect to the real product page URL and extract from there. The token
// is a short alphanumeric slug, optionally behind a /d/ share prefix.
const SHORT_LINK_RE =
  /https?:\/\/(?:amzn\.to|a\.co|amzn\.eu|amzn\.asia)\/(?:d\/)?[A-Za-z0-9]{4,20}/gi;

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
  return host.toLowerCase().replace(/\.$/, "");
}

/**
 * Extract every Amazon product on an aggregator page. Deduped by (asin,
 * marketplace) so the same product genuinely listed on two marketplaces
 * (amazon.com and amazon.co.uk) keeps a row for each: a creator with tags in
 * both regions can promote both. First occurrence wins per marketplace and
 * original page order is preserved so the review list mirrors the source.
 */
export function extractDeals(html: string, sourceUrl: string): HarvestedDeal[] {
  const byKey = new Map<string, HarvestedDeal>();
  // ASINs seen via an ABSOLUTE Amazon link, which carries the real marketplace.
  // A relative/data match defaults to .com and the relative regex also fires on
  // the `/dp/<asin>` *inside* an absolute URL, so a relative match for an ASIN
  // we already placed absolutely is almost always that same URL's tail: we drop
  // it rather than invent a second, wrong .com row. This is only about the
  // relative-vs-absolute double count; two absolute links on different hosts
  // are two real products and both are kept.
  const absoluteAsins = new Set<string>();

  // Set a promo code on any already-placed row for this ASIN that lacks one
  // (the code and the link often ride different elements, across marketplaces).
  const backfillCode = (asin: string, promoCode: string | null): void => {
    if (!promoCode) return;
    for (const deal of byKey.values()) {
      if (deal.asin === asin && !deal.promoCode) deal.promoCode = promoCode;
    }
  };

  const place = (asin: string, marketplace: string, promoCode: string | null) => {
    const key = `${marketplace}:${asin}`;
    const existing = byKey.get(key);
    if (existing) {
      if (promoCode && !existing.promoCode) existing.promoCode = promoCode;
      return;
    }
    byKey.set(key, { asin, marketplace, sourceUrl, promoCode });
  };

  const addAbsolute = (asin: string, marketplace: string) => {
    absoluteAsins.add(asin);
    place(asin, marketplace, null);
  };

  const addDefault = (asin: string, promoCode: string | null) => {
    // Suppress a .com default row for an ASIN already captured absolutely (it is
    // the tail of that URL), but still carry any promo code onto the real row.
    if (absoluteAsins.has(asin)) {
      backfillCode(asin, promoCode);
      return;
    }
    place(asin, DEFAULT_MARKETPLACE, promoCode);
  };

  // Absolute links first: they carry the real marketplace host and mark the
  // ASIN so a later relative match of the same URL's tail is not double-counted.
  for (const m of html.matchAll(ABSOLUTE_ASIN_RE)) {
    addAbsolute(m[2] as string, marketplaceFromHost(m[1] ?? DEFAULT_MARKETPLACE));
  }
  // Relative links and asin= params: marketplace unknown, default to .com.
  for (const m of html.matchAll(RELATIVE_ASIN_RE)) {
    addDefault(m[1] as string, null);
  }
  // data-asin attributes on embeds.
  for (const m of html.matchAll(DATA_ASIN_RE)) {
    addDefault(m[1] as string, null);
  }
  // Pair ASIN + promo code when both ride the same element.
  for (const m of html.matchAll(DATA_PAIR_RE)) {
    addDefault(m[1] as string, (m[2] ?? "").trim() || null);
  }

  const generic = [...byKey.values()];
  const parser = SITE_PARSERS[hostOf(sourceUrl)];
  return parser ? parser(html, sourceUrl, generic) : generic;
}

/**
 * Every Amazon short link (amzn.to / a.co / amzn.eu / amzn.asia) on the page,
 * deduped, original order preserved. Pure and DOM-free like extractDeals; the
 * background follows each redirect and feeds the final URL to
 * dealFromAmazonUrl below.
 */
export function extractShortLinks(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(SHORT_LINK_RE)) {
    const url = (m[0] as string).replace(/^http:/i, "https:");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Turn a fully-resolved Amazon product URL (where a short link landed) into a
 * HarvestedDeal attributed to the aggregator page it came from. Returns null
 * when the URL is not an ASIN-bearing Amazon URL (expired link, bot wall
 * bounce, non-product landing page).
 */
export function dealFromAmazonUrl(finalUrl: string, sourceUrl: string): HarvestedDeal | null {
  ABSOLUTE_ASIN_RE.lastIndex = 0;
  const m = ABSOLUTE_ASIN_RE.exec(finalUrl);
  if (!m) return null;
  return {
    asin: m[2] as string,
    marketplace: marketplaceFromHost(m[1] ?? DEFAULT_MARKETPLACE),
    sourceUrl,
    promoCode: null,
  };
}
