// Small URL helpers shared by the deeplink adapters and the routing module.
// Kept separate so adapters and routing can both import them without a cycle.

// Canonical short product url for an ASIN on a marketplace, for example
// https://www.amazon.com/dp/B012345678. Falls back to the given url when there
// is no ASIN.
export function canonicalProductUrl(asin: string, marketplace: string, fallback: string): string {
  if (!asin) return fallback;
  const domain = marketplace.startsWith("www.") ? marketplace : `www.${marketplace}`;
  return `https://${domain}/dp/${asin}`;
}

// Add or replace the Amazon Associates tag on a product url.
export function withAffiliateTag(url: string, tag: string): string {
  if (!tag) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("tag", tag);
    return parsed.toString();
  } catch {
    // Not a parseable absolute url: append conservatively.
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}tag=${encodeURIComponent(tag)}`;
  }
}
