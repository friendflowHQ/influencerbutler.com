// The retailer a page belongs to. The extension started Amazon-only; Walmart is
// the second retailer and Target the third (product pages only: the
// cross-retailer card and price chips, no commission or market data).
// `marketplace` (the bare hostname, e.g. "amazon.com" / "walmart.com" /
// "target.com") still namespaces product ids, so the retailer discriminator is
// mostly for choosing the right DOM layer and the right link-building path.

export type Retailer = "amazon" | "walmart" | "target";

// The retailers that take part in affiliate links, market data and the search
// overlays. Target is deliberately outside it: no link routing, rate card or
// pooled market data exists for Target, so those flows never see it.
export type AffiliateRetailer = Exclude<Retailer, "target">;

// Product-id validators, centralized so the shape check lives in one place
// instead of being inlined as a bare regex across the extractors/overlays.
export const AMAZON_ASIN_RE = /^[A-Z0-9]{10}$/;
// A Walmart item id is a variable-length numeric string (from /ip/<slug>/<id>).
export const WALMART_ITEM_ID_RE = /^\d{3,15}$/;
// A Target TCIN is 7-10 digits (from /p/<slug>/-/A-<tcin>).
export const TARGET_TCIN_RE = /^\d{7,10}$/;

/**
 * The retailer for a hostname. Any walmart.com host is Walmart, any target.com
 * host is Target; everything else (amazon.*, affiliate-program.amazon.*) is
 * Amazon, preserving the prior Amazon-only default.
 */
export function retailerFromHost(host: string): Retailer {
  const bare = host.replace(/^www\./, "").toLowerCase();
  if (bare === "walmart.com" || bare.endsWith(".walmart.com")) return "walmart";
  if (bare === "target.com" || bare.endsWith(".target.com")) return "target";
  return "amazon";
}

/** The retailer for a full URL. Falls back to Amazon on a malformed URL. */
export function retailerFromUrl(url: string): Retailer {
  try {
    return retailerFromHost(new URL(url).hostname);
  } catch {
    return "amazon";
  }
}

/** Whether `id` is a well-formed product id for `retailer`. */
export function productIdValid(retailer: Retailer, id: string): boolean {
  if (retailer === "walmart") return WALMART_ITEM_ID_RE.test(id);
  if (retailer === "target") return TARGET_TCIN_RE.test(id);
  return AMAZON_ASIN_RE.test(id);
}
