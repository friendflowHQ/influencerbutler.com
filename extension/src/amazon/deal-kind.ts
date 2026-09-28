// The sale / deal kind read off an Amazon deal badge, shared by the search-tile
// reader and the product-page reader (kept in its own module so neither imports
// the other). The "-N%" discount depth is computed separately from the
// strikethrough list price; this only classifies the badge label.

export type DealKind = "primeday" | "lightning" | "coupon" | "reduced";

// Maps an Amazon deal-badge / savings string to a known deal kind (exported for
// tests). Matches the English event names Amazon renders across marketplaces,
// then a generic "deal" / "% off" / "limited time" fallback. Returns null for
// anything that is not a recognizable deal so a stray badge (e.g. "Best
// Seller") is ignored. Prime Big Deal Days and Prime Day both map to "primeday".
export function parseDealBadgeText(text: string): DealKind | null {
  const t = text.toLowerCase();
  if (/prime\s*(?:big\s*deal\s*days|day)|big\s*deal\s*days/.test(t)) return "primeday";
  if (/lightning\s*deal/.test(t)) return "lightning";
  if (/coupon/.test(t)) return "coupon";
  if (/deal|%\s*off|-\s*\d+\s*%|limited\s*time/.test(t)) return "reduced";
  return null;
}
