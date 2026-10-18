// Small URL helpers shared by the deeplink adapters and the routing module.
// Kept separate so adapters and routing can both import them without a cycle.
import type { Retailer } from "../shared/retailer";

// Canonical short product url for a product id on a marketplace. Amazon:
// https://www.amazon.com/dp/B012345678. Walmart: https://www.walmart.com/ip/123. Target: https://www.target.com/p/-/A-123.
// Falls back to the given url when there is no id.
export function canonicalProductUrl(
  id: string,
  marketplace: string,
  fallback: string,
  retailer: Retailer = "amazon",
): string {
  if (!id) return fallback;
  const domain = marketplace.startsWith("www.") ? marketplace : `www.${marketplace}`;
  // Target's canonical form is /p/-/A-<tcin> (the slug is optional).
  if (retailer === "target") return `https://${domain}/p/-/A-${id}`;
  const path = retailer === "walmart" ? "ip" : "dp";
  return `https://${domain}/${path}/${id}`;
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
