import type { CcRate, SpccRate } from "../../shared/messages";

// Pure helpers for the storefront money chips: a content card tags several
// products, so each card shows the BEST campaign among them (highest Creator
// Connections rate, highest SPCC $/click) plus how many tagged products have a
// campaign at all. DOM-free so it is unit-testable.

export type CardCampaignInput = {
  asins: string[];
  // Bloom-filter membership (instant, ~1% false positives).
  ccFlagged: ReadonlySet<string>;
  spccFlagged: ReadonlySet<string>;
  // Deals-filter membership (a current Amazon deal / Prime Day price). Optional:
  // absent when the deal chip is switched off.
  dealFlagged?: ReadonlySet<string>;
  // Real terms from the daily rate tables; an ASIN missing here has no row.
  ccRates: Readonly<Record<string, CcRate>>;
  spccRates: Readonly<Record<string, SpccRate>>;
};

export type CardCampaignSummary = {
  // Best CC campaign among the tagged products. `rate` is null while the rate
  // lookup has not landed (the chip then reads a plain "Campaign").
  cc: { rate: CcRate | null; count: number } | null;
  spcc: { rate: SpccRate | null; count: number } | null;
  // How many tagged products are on a deal.
  deal: { count: number } | null;
  // Distinct tagged products in at least one campaign or deal.
  products: number;
};

// null when none of the card's tagged products has a campaign or a deal.
export function summarizeCard(input: CardCampaignInput): CardCampaignSummary | null {
  const ccAsins = input.asins.filter((a) => input.ccFlagged.has(a));
  const spccAsins = input.asins.filter((a) => input.spccFlagged.has(a));
  const dealAsins = input.asins.filter((a) => input.dealFlagged?.has(a));

  let cc: CardCampaignSummary["cc"] = null;
  if (ccAsins.length > 0) {
    let best: CcRate | null = null;
    for (const asin of ccAsins) {
      const rate = input.ccRates[asin];
      if (rate && (!best || rate.ratePct > best.ratePct)) best = rate;
    }
    cc = { rate: best, count: ccAsins.length };
  }

  let spcc: CardCampaignSummary["spcc"] = null;
  if (spccAsins.length > 0) {
    let best: SpccRate | null = null;
    for (const asin of spccAsins) {
      const rate = input.spccRates[asin];
      if (rate && (!best || rate.epc > best.epc)) best = rate;
    }
    spcc = { rate: best, count: spccAsins.length };
  }

  const deal = dealAsins.length > 0 ? { count: dealAsins.length } : null;

  if (!cc && !spcc && !deal) return null;
  const products = new Set([...ccAsins, ...spccAsins, ...dealAsins]).size;
  return { cc, spcc, deal, products };
}

// Float rank: 3 campaign + deal, 2 campaign, 1 deal only, 0 neither. A creator
// scanning their storefront wants to know where their money is, and a product
// that is both in a campaign and on a deal is the best place to send traffic.
export function floatRank(summary: CardCampaignSummary | null): number {
  if (!summary) return 0;
  return (summary.cc || summary.spcc ? 2 : 0) + (summary.deal ? 1 : 0);
}

// CSS `order` for each card, given its rank in DOM order. Ranked cards get
// negative values (best rank first, DOM order within a rank) so they sit ahead
// of every unranked card, which keeps the default order 0 and its DOM position.
// Pure so the reorder is testable without a DOM.
export function floatOrders(ranks: readonly number[]): number[] {
  const floated = ranks
    .map((rank, index) => ({ rank, index }))
    .filter((c) => c.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index);
  const orders = ranks.map(() => 0);
  floated.forEach((c, i) => {
    orders[c.index] = i - floated.length;
  });
  return orders;
}

// ISO currency for a marketplace host ("amazon.co.uk" -> GBP). The storefront
// cards carry no price, so this only formats the SPCC $/click figure.
export function currencyForMarketplace(marketplace: string): string {
  const host = marketplace.toLowerCase();
  if (host.endsWith("amazon.co.uk")) return "GBP";
  if (/amazon\.(de|fr|it|es|nl|ie)$/.test(host)) return "EUR";
  if (host.endsWith("amazon.ca")) return "CAD";
  if (host.endsWith("amazon.com.au")) return "AUD";
  return "USD";
}
