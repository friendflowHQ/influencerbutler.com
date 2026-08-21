/**
 * walmart-rate-card.ts - Walmart's affiliate commission schedule as a static
 * category -> rate table.
 *
 * Walmart's affiliate program runs through Impact, which (unlike Amazon's
 * login-gated rate card that the desktop app harvests) exposes no clean rates
 * feed. So the schedule lives here in code, served in the SAME `RateCard` shape
 * the Amazon rate card uses, letting the extension reuse its category-matching
 * logic (rateForCategory) verbatim.
 *
 * NOTE: these are Walmart's published Impact category rates and change over
 * time. Update this table when Walmart revises the schedule; the `VERSION`
 * bump is what invalidates the extension's cached copy via ETag.
 */
import type { RateCard, RateCardRow } from "./rate-card";

export const WALMART_MARKETPLACE = "walmart.com";

// Bump when the rates/tokens below change, so the ETag changes and clients refetch.
const VERSION = "2026-08-21";

// Catch-all for any category not matched below (most electronics-adjacent and
// commodity items sit at the low end).
const DEFAULT_RATE_PCT = 1;

// label -> rate; tokens are the lowercased words the extension token-matches a
// product's breadcrumb/category against. Ordered most-specific first is not
// required (matching is token-overlap), but grouping related terms helps.
const ROWS: RateCardRow[] = [
  { label: "Electronics", tokens: ["electronics", "computers", "tv", "video", "cell", "phones"], ratePct: 1 },
  { label: "Video Games & Consoles", tokens: ["video games", "gaming", "consoles"], ratePct: 1 },
  { label: "Photo & Camera", tokens: ["photo", "camera", "cameras"], ratePct: 3 },
  { label: "Home & Garden", tokens: ["home", "garden", "furniture", "patio", "kitchen", "dining", "decor", "bedding", "bath"], ratePct: 4 },
  { label: "Beauty", tokens: ["beauty", "cosmetics", "skincare", "skin", "makeup", "nail", "hair", "fragrance"], ratePct: 4 },
  { label: "Health & Wellness", tokens: ["health", "wellness", "personal care", "vitamin", "supplement"], ratePct: 4 },
  { label: "Baby", tokens: ["baby", "toddler", "infant", "diaper", "formula"], ratePct: 4 },
  { label: "Toys", tokens: ["toys", "toy", "games", "puzzle", "doll"], ratePct: 4 },
  { label: "Clothing & Accessories", tokens: ["clothing", "apparel", "shoes", "accessories", "fashion", "jeans", "dress"], ratePct: 4 },
  { label: "Jewelry", tokens: ["jewelry", "watches"], ratePct: 4 },
  { label: "Sports & Outdoors", tokens: ["sports", "outdoors", "fitness", "exercise", "camping", "bike"], ratePct: 4 },
  { label: "Auto & Tires", tokens: ["auto", "automotive", "tires", "parts"], ratePct: 4 },
  { label: "Pets", tokens: ["pet", "pets"], ratePct: 4 },
  { label: "Grocery & Food", tokens: ["grocery", "food", "beverages", "gourmet", "milk", "dairy", "snack", "produce", "meat", "bakery", "coffee", "candy", "pantry"], ratePct: 1 },
  { label: "Household Essentials", tokens: ["household", "cleaning", "paper", "essentials", "laundry"], ratePct: 1 },
  { label: "Office & Crafts", tokens: ["office", "crafts", "supplies"], ratePct: 4 },
  { label: "Tools & Home Improvement", tokens: ["tools", "hardware", "home improvement"], ratePct: 4 },
];

/**
 * The Walmart rate card in the shared RateCard shape. Always available (no R2
 * dependency), so the serve route never soft-fails for Walmart.
 */
export function buildWalmartRateCard(): RateCard {
  return {
    marketplace: WALMART_MARKETPLACE,
    version: VERSION,
    source: "https://www.walmart.com/creators/ (Impact affiliate schedule)",
    checkedAt: null,
    defaultRatePct: DEFAULT_RATE_PCT,
    rows: ROWS,
  };
}
