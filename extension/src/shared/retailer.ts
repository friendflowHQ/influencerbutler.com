// The retailer a page belongs to. The extension started Amazon-only; Walmart is
// the second retailer. `marketplace` (the bare hostname, e.g. "amazon.com" /
// "walmart.com") still namespaces product ids, so the retailer discriminator is
// mostly for choosing the right DOM layer and the right link-building path.

export type Retailer = "amazon" | "walmart";

// Product-id validators, centralized so the shape check lives in one place
// instead of being inlined as a bare regex across the extractors/overlays.
export const AMAZON_ASIN_RE = /^[A-Z0-9]{10}$/;
// A Walmart item id is a variable-length numeric string (from /ip/<slug>/<id>).
export const WALMART_ITEM_ID_RE = /^\d{3,15}$/;

/**
 * The retailer for a hostname. Any walmart.com host is Walmart; everything else
 * (amazon.*, affiliate-program.amazon.*) is Amazon, preserving the prior
 * Amazon-only default.
 */
export function retailerFromHost(host: string): Retailer {
  const bare = host.replace(/^www\./, "").toLowerCase();
  return bare === "walmart.com" || bare.endsWith(".walmart.com") ? "walmart" : "amazon";
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
  return retailer === "walmart" ? WALMART_ITEM_ID_RE.test(id) : AMAZON_ASIN_RE.test(id);
}
