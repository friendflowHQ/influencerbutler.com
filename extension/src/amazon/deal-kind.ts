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
  if (/prime\s*(?:big\s*deal(?:\s*days)?|day)|big\s*deal\s*days/.test(t)) return "primeday";
  if (/lightning\s*deal/.test(t)) return "lightning";
  if (/coupon/.test(t)) return "coupon";
  if (/deal|%\s*off|-\s*\d+\s*%|limited\s*time/.test(t)) return "reduced";
  return null;
}

// Smallest cut worth a "-N%" on a tile chip. A strike-through a few percent above
// the price (Amazon's "Typical price" reference) is not a deal and reads as noise.
export const MIN_DEAL_DISCOUNT_PCT = 10;

// The "-N%" depth from the current and strike-through prices, or null when there is
// no strike price or the cut is below MIN_DEAL_DISCOUNT_PCT.
export function dealDiscountPct(
  priceCents: number | null | undefined,
  wasPriceCents: number | null | undefined,
): number | null {
  if (priceCents == null || wasPriceCents == null) return null;
  if (!(priceCents > 0) || wasPriceCents <= priceCents) return null;
  const pct = Math.round((1 - priceCents / wasPriceCents) * 100);
  return pct >= MIN_DEAL_DISCOUNT_PCT ? pct : null;
}

// True when the strike-through label is Amazon's "Typical price" / "Typical:" (a reference
// price, not a was/list price), so it must not be read as a discount.
export function isTypicalPriceLabel(text: string): boolean {
  return /\btypical\b/i.test(text) && !/list\s*price|was\s*:|reg(?:ular|\.)?\s*price/i.test(text);
}
