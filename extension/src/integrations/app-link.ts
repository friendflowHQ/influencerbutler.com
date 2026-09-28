import { ASIN_URL_RE } from "../amazon/product-signals";
import { AMAZON_ASIN_RE } from "../shared/retailer";

// App-opening Amazon links: carry Amazon's own SiteStripe share parameters
// (`linkCode=ssc` + `creativeASIN=<ASIN>`) so a product link opens straight in
// the Amazon app on a phone instead of the mobile web. Free, first-party, and
// harmless on desktop. A port of the desktop app's idempotent tagger: it only
// touches Amazon product urls, never fights an existing attribution scheme, and
// hands anything it does not understand back untouched.
//
// Pure (no storage, no chrome apis): the caller decides whether the setting is
// on. Kept separate from url.ts so adapters and routing share one definition.

// Query keys that mean "someone already attributed this link" (SiteStripe,
// Associates Central link builder, OneLink, sub-tag tracking). When ANY of these
// is present we leave the url alone rather than stack a second scheme on top.
// Compared case-insensitively.
export const PROTECTED_ATTRIBUTION_KEYS: readonly string[] = [
  "creativeASIN",
  "asc_item-id",
  "linkId",
  "camp",
  "creative",
  "ascsubtag",
];

const PROTECTED_LOWER = new Set(PROTECTED_ATTRIBUTION_KEYS.map((k) => k.toLowerCase()));

function isAmazonHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host === "amazon.com" || /(^|\.)amazon\.[a-z.]+$/.test(host);
}

// The existing query key matching `name` case-insensitively, or null.
function findKey(params: URLSearchParams, name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of params.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Add the app-opening SiteStripe params to an Amazon product url.
 *
 * Rules:
 * - Only Amazon hosts with a `/dp/<ASIN>` or `/gp/product/<ASIN>` path are
 *   touched; Walmart, search/browse pages and short links come back unchanged.
 * - If the url already carries any PROTECTED_ATTRIBUTION_KEYS param it is
 *   returned unchanged (someone already attributed it).
 * - An existing `linkCode` is never overwritten; otherwise `linkCode=ssc` is set.
 * - `creativeASIN` is the given ASIN, uppercased, and must look like an ASIN
 *   (falls back to the ASIN in the path when the argument does not).
 * - A malformed url passes through unchanged.
 */
export function withAppOpenParams(url: string, asin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isAmazonHost(parsed.hostname)) return url;
  const pathMatch = parsed.pathname.match(ASIN_URL_RE);
  if (!pathMatch) return url;

  const params = parsed.searchParams;
  for (const key of params.keys()) {
    if (PROTECTED_LOWER.has(key.toLowerCase())) return url;
  }

  const wanted = (asin ?? "").trim().toUpperCase();
  const creative = AMAZON_ASIN_RE.test(wanted) ? wanted : (pathMatch[1] ?? "");
  if (!AMAZON_ASIN_RE.test(creative)) return url;

  if (!findKey(params, "linkCode")) params.set("linkCode", "ssc");
  params.set("creativeASIN", creative);
  return parsed.toString();
}
