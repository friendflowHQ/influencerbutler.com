/**
 * target-rate-card.ts - Target's affiliate commission schedule as a static
 * category -> rate table.
 *
 * Target Partners runs through Impact and publishes no per-category rate feed
 * (the real schedule is only visible inside the program terms). Third-party
 * write-ups disagree, and only the "up to 8%" ceiling is consistently reported.
 * So these rows are deliberately CONSERVATIVE ESTIMATES that stay at or below
 * what every source reports, served in the SAME `RateCard` shape the Amazon and
 * Walmart cards use so the extension reuses rateForCategory verbatim. The
 * extension labels every figure derived from this card as an estimate.
 *
 * TODO(owner): replace with the real schedule from the Target Partners Impact
 * dashboard / insertion order, then bump VERSION so clients refetch via ETag.
 */
import type { RateCard, RateCardRow } from "./rate-card";

export const TARGET_MARKETPLACE = "target.com";

// Bump when the rates/tokens below change, so the ETag changes and clients refetch.
const VERSION = "2026-10-18-estimate";

// Catch-all for any category not matched below.
const DEFAULT_RATE_PCT = 1;

const ROWS: RateCardRow[] = [
  { label: "Electronics", tokens: ["electronics", "computers", "tv", "cell", "phones", "headphones"], ratePct: 1 },
  { label: "Video Games", tokens: ["video games", "gaming", "consoles"], ratePct: 1 },
  { label: "Toys", tokens: ["toys", "toy", "puzzle", "doll", "lego"], ratePct: 1 },
  { label: "Grocery & Essentials", tokens: ["grocery", "food", "beverages", "snack", "pantry", "household", "cleaning", "paper", "laundry"], ratePct: 1 },
  { label: "Health & Beauty", tokens: ["health", "wellness", "beauty", "skincare", "skin", "makeup", "hair", "fragrance", "vitamin", "personal care"], ratePct: 2 },
  { label: "Baby", tokens: ["baby", "toddler", "infant", "diaper", "nursery"], ratePct: 3 },
  { label: "Home & Garden", tokens: ["home", "garden", "furniture", "patio", "kitchen", "dining", "decor", "bedding", "bath", "storage"], ratePct: 3 },
  { label: "Clothing & Accessories", tokens: ["clothing", "apparel", "shoes", "accessories", "fashion", "jeans", "dress", "jewelry"], ratePct: 3 },
  { label: "Sports & Outdoors", tokens: ["sports", "outdoors", "fitness", "exercise", "camping", "bike"], ratePct: 3 },
  { label: "Pets", tokens: ["pet", "pets"], ratePct: 2 },
  { label: "Office & Crafts", tokens: ["office", "crafts", "supplies", "school"], ratePct: 2 },
];

/**
 * The Target rate card in the shared RateCard shape. Always available (no R2
 * dependency), so the serve route never soft-fails for Target.
 */
export function buildTargetRateCard(): RateCard {
  return {
    marketplace: TARGET_MARKETPLACE,
    version: VERSION,
    source: "Estimate: Target Partners (Impact) publishes no public rate feed",
    checkedAt: null,
    defaultRatePct: DEFAULT_RATE_PCT,
    rows: ROWS,
    // No Subscribe & Save bounty program exists.
    snsBounty: [],
  };
}
