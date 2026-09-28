// Pure logic for the Global Marketplace Maximizer: turn Creator-API enrich rows
// into the per-market read a creator needs (available? at what price? worth how
// much commission?) and summarize how much international reach a product has.
// No DOM or Chrome APIs so it is unit-tested; the panel handles rendering and
// the enrich/link round trips.

export type MarketAvailability = "available" | "unavailable" | "notlisted";

// The subset of an enriched product row this module reasons over. Kept local
// (structurally typed) so the pure module does not depend on the messages type.
export type EnrichLike = {
  marketplace: string;
  found: boolean;
  availability: string | null;
  priceCents: number | null;
};

// Availability from an enrich row: not listed when the market has no offer,
// unavailable when the offer text says so, available otherwise. Mirrors the
// inline card's derivation so the two surfaces agree.
export function marketAvailability(row: EnrichLike): MarketAvailability {
  if (!row.found) return "notlisted";
  const message = (row.availability ?? "").toLowerCase();
  if (/unavailable|out of stock|no longer|not available/.test(message)) return "unavailable";
  return "available";
}

// Estimated commission for one sale in cents: price times the creator's rate.
// The rate is the single rate the extension can resolve (Associates rates vary
// by marketplace and category, which the client has no table for), so the panel
// labels this an estimate. Null when price or rate is unknown.
export function estimateCommissionCents(
  priceCents: number | null,
  ratePct: number | null,
): number | null {
  if (priceCents === null || ratePct === null) return null;
  if (priceCents < 0 || ratePct < 0) return null;
  return Math.round((priceCents * ratePct) / 100);
}

// How many markets carry the product, out of the markets we have data for.
// "Reach beyond home" is what tells a creator whether international links are
// worth generating at all.
export function summarizeReach(
  rows: Array<{ code: string; availability: MarketAvailability }>,
  homeCode: string,
): { availableTotal: number; availableAbroad: number; withData: number } {
  let availableTotal = 0;
  let availableAbroad = 0;
  for (const row of rows) {
    if (row.availability === "available") {
      availableTotal += 1;
      if (row.code !== homeCode) availableAbroad += 1;
    }
  }
  return { availableTotal, availableAbroad, withData: rows.length };
}
