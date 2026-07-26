import { describe, expect, it } from "vitest";
import type { AsinEarnings } from "../../transport/hud-commands";
import {
  aggregateEarnings,
  formatMoney,
  hasBreakdown,
  scopedCurrencyTotals,
  tileTotals,
} from "./model";

// The DOM tile parser (amazon/storefront-tiles.ts, amazon/storefront-cards.ts)
// needs a browser document, and this repo runs vitest in the node environment
// with no jsdom, so per the existing convention (creator-campaigns.test.ts,
// search-results.test.ts) the parser is covered by the live smoke test and the
// tests here exercise the pure earnings math that carries the real logic:
// marketplace scoping, tile summing, and multi-ASIN aggregation.

// Modeled on David L Peters' post in the Cha-Ching group: one product earning on
// both an onsite and an offsite US tracking id, split across years.
const solar: AsinEarnings = {
  asin: "B0CSG3YWR6",
  hasEarnings: true,
  byCurrency: [{ currency: "USD", amount: 139.4, count: 24 }],
  totalCount: 24,
  byStore: [
    {
      trackingId: "onamzdavi039-20",
      placement: "onsite",
      marketplace: "amazon.com",
      currency: "USD",
      amount: 127.35,
      units: 96,
      orders: 18,
    },
    {
      trackingId: "davi039-20",
      placement: "offsite",
      marketplace: "amazon.com",
      currency: "USD",
      amount: 12.05,
      units: 6,
      orders: 6,
    },
  ],
  byYear: [
    { year: 2026, currency: "USD", amount: 75, units: 30, orders: 18 },
    { year: 2024, currency: "USD", amount: 41.2, units: 46, orders: 0 },
    { year: 2025, currency: "USD", amount: 23.2, units: 26, orders: 0 },
  ],
  byMonth: [{ month: "2026-07", currency: "USD", amount: 12 }],
  campaigns: [
    { name: "Solar Independence", ratePct: 10, clicks: 98, orders: 18, currency: "USD", amount: 43.8 },
  ],
};

// A second product earning only in Germany, to prove marketplace scoping keeps
// the two apart (the confusion in the Facebook thread).
const germanOnly: AsinEarnings = {
  asin: "B0GERMAN01",
  hasEarnings: true,
  byCurrency: [{ currency: "EUR", amount: 20, count: 4 }],
  totalCount: 4,
  byStore: [
    {
      trackingId: "davi039-21",
      placement: "onsite",
      marketplace: "amazon.de",
      currency: "EUR",
      amount: 20,
      units: 4,
      orders: 4,
    },
  ],
};

// A flat record from an older desktop build: totals only, no buckets.
const flatOnly: AsinEarnings = {
  asin: "B0FLAT0001",
  hasEarnings: true,
  byCurrency: [{ currency: "USD", amount: 50, count: 5 }],
  totalCount: 5,
};

describe("formatMoney", () => {
  it("uses a symbol for common currencies and always two decimals", () => {
    expect(formatMoney(139.4, "USD")).toBe("$139.40");
    expect(formatMoney(12, "GBP")).toBe("£12.00");
    expect(formatMoney(20, "EUR")).toBe("€20.00");
  });

  it("falls back to the ISO code for uncommon currencies", () => {
    expect(formatMoney(5, "SEK")).toBe("5.00 SEK");
  });
});

describe("hasBreakdown", () => {
  it("is true when any bucket is present", () => {
    expect(hasBreakdown(solar)).toBe(true);
    expect(hasBreakdown(germanOnly)).toBe(true);
  });

  it("is false for a flat totals-only record", () => {
    expect(hasBreakdown(flatOnly)).toBe(false);
  });
});

describe("scopedCurrencyTotals", () => {
  it("sums only the viewed marketplace's stores in market scope", () => {
    const totals = scopedCurrencyTotals(solar, "market", "amazon.com");
    expect(totals).toEqual([{ currency: "USD", amount: 139.4, count: 24 }]);
  });

  it("returns zero for a marketplace the product never earned in", () => {
    // The German-storefront-shows-US-totals bug, fixed: viewing amazon.de shows
    // nothing for a US-only product instead of its worldwide total.
    expect(scopedCurrencyTotals(solar, "market", "amazon.de")).toEqual([]);
  });

  it("returns the worldwide byCurrency total in all scope", () => {
    expect(scopedCurrencyTotals(solar, "all", "amazon.de")).toEqual([
      { currency: "USD", amount: 139.4, count: 24 },
    ]);
  });

  it("falls back to byCurrency when there is no store split", () => {
    expect(scopedCurrencyTotals(flatOnly, "market", "amazon.com")).toEqual([
      { currency: "USD", amount: 50, count: 5 },
    ]);
  });
});

describe("tileTotals", () => {
  const byAsin = new Map<string, AsinEarnings>([
    [solar.asin, solar],
    [germanOnly.asin, germanOnly],
    [flatOnly.asin, flatOnly],
  ]);

  it("sums a card's products scoped to the viewed marketplace", () => {
    const totals = tileTotals(byAsin, [solar.asin, germanOnly.asin], "market", "amazon.com");
    // Only the US product counts on amazon.com; the German one drops out.
    expect(totals).toEqual([{ currency: "USD", amount: 139.4, count: 24 }]);
  });

  it("keeps currencies separate and sorts by amount in all scope", () => {
    const totals = tileTotals(byAsin, [solar.asin, germanOnly.asin], "all", "amazon.com");
    expect(totals).toEqual([
      { currency: "USD", amount: 139.4, count: 24 },
      { currency: "EUR", amount: 20, count: 4 },
    ]);
  });

  it("skips ASINs with no earnings and returns empty when nothing paid", () => {
    expect(tileTotals(byAsin, ["B0UNKNOWN01"], "market", "amazon.com")).toEqual([]);
    expect(tileTotals(byAsin, [germanOnly.asin], "market", "amazon.com")).toEqual([]);
  });

  it("matches ASINs case-insensitively", () => {
    const totals = tileTotals(byAsin, [solar.asin.toLowerCase()], "market", "amazon.com");
    expect(totals).toEqual([{ currency: "USD", amount: 139.4, count: 24 }]);
  });
});

describe("aggregateEarnings", () => {
  it("returns one ASIN's buckets sorted for the popup", () => {
    const agg = aggregateEarnings([solar]);
    expect(agg.byYear.map((y) => y.year)).toEqual([2026, 2025, 2024]);
    expect(agg.byStore.map((s) => s.trackingId)).toEqual(["onamzdavi039-20", "davi039-20"]);
    expect(agg.campaigns[0]).toMatchObject({ name: "Solar Independence", clicks: 98, orders: 18 });
  });

  it("merges stores, years, and campaigns across products by key", () => {
    const other: AsinEarnings = {
      asin: "B0OTHER001",
      hasEarnings: true,
      byCurrency: [{ currency: "USD", amount: 10, count: 2 }],
      totalCount: 2,
      byStore: [
        {
          trackingId: "onamzdavi039-20",
          placement: "onsite",
          marketplace: "amazon.com",
          currency: "USD",
          amount: 10,
          units: 3,
          orders: 2,
        },
      ],
      byYear: [{ year: 2026, currency: "USD", amount: 10, units: 3, orders: 2 }],
      campaigns: [
        { name: "Solar Independence", ratePct: 10, clicks: 2, orders: 2, currency: "USD", amount: 5 },
      ],
    };
    const agg = aggregateEarnings([solar, other]);
    const store = agg.byStore.find((s) => s.trackingId === "onamzdavi039-20");
    expect(store).toMatchObject({ amount: 137.35, units: 99, orders: 20 });
    const y2026 = agg.byYear.find((y) => y.year === 2026);
    expect(y2026).toMatchObject({ amount: 85, units: 33, orders: 20 });
    const campaign = agg.campaigns.find((c) => c.name === "Solar Independence");
    expect(campaign).toMatchObject({ clicks: 100, orders: 20, amount: 48.8 });
  });

  it("ignores records with no earnings via the caller filter shape", () => {
    const agg = aggregateEarnings([flatOnly]);
    expect(agg.byCurrency).toEqual([{ currency: "USD", amount: 50, count: 5 }]);
    expect(agg.byStore).toEqual([]);
  });
});
