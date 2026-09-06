/**
 * enriched-item.ts - the retailer-agnostic product shape returned by the
 * /api/extension/enrich route.
 *
 * Both the Amazon Creator API client (creators-api.ts) and the Walmart Affiliate
 * API client (walmart-api.ts) normalize into this one shape so everything downstream (the
 * enrich route, the extension) stays retailer-blind. Amazon-only fields
 * (primeEligible, binding) and Walmart-only fields (numReviews, retailerRank)
 * are simply null on the retailer that has no equivalent.
 */

export type Retailer = "amazon" | "walmart";

export type EnrichedItem = {
  retailer: Retailer;
  marketplace: string;
  // The retailer's product id: an Amazon ASIN or a Walmart item id. Kept as
  // `asin` for back-compat with the extension's current reader; `itemId` holds
  // the same value spelled generically. One of them is always set when found.
  asin: string | null;
  itemId: string | null;
  found: boolean;
  title: string | null;
  brand: string | null;
  priceDisplay: string | null;
  priceCents: number | null;
  currency: string | null;
  availability: string | null;
  // Amazon-only: Prime eligibility and binding/format. Null for Walmart.
  primeEligible: boolean | null;
  binding: string | null;
  browseNode: string | null;
  imageUrl: string | null;
  detailPageUrl: string | null;
  // Walmart-only demand signals (Amazon uses BSR + bought-past-month instead).
  // numReviews feeds the review-velocity sales estimate; retailerRank is
  // Walmart's own bestSellerRank when the item carries one. Null for Amazon.
  numReviews: number | null;
  retailerRank: number | null;
  error: string | null;
};

// A not-found / error row for one product id, with every field nulled out
// except the identity and the reason. Shared by both retailer clients.
export function emptyEnrichedItem(opts: {
  retailer: Retailer;
  marketplace: string;
  error: string | null;
  found?: boolean;
  id?: string | null;
}): EnrichedItem {
  const id = opts.id ?? null;
  return {
    retailer: opts.retailer,
    marketplace: opts.marketplace,
    asin: opts.retailer === "amazon" ? id : null,
    itemId: id,
    found: opts.found ?? false,
    title: null,
    brand: null,
    priceDisplay: null,
    priceCents: null,
    currency: null,
    availability: null,
    primeEligible: null,
    binding: null,
    browseNode: null,
    imageUrl: null,
    detailPageUrl: null,
    numReviews: null,
    retailerRank: null,
    error: opts.error,
  };
}
