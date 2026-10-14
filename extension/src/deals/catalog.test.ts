import { describe, expect, it } from "vitest";
import { NO_FILTERS, buildCatalogView, matchesFilters, matchesTab, tabCounts, type CatalogItem } from "./catalog";

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return { discountPct: null, priceCents: null, ccRatePct: null, epc: null, hasPromo: false, order: 0, ...over };
}

describe("matchesTab", () => {
  it("splits CC, EPC and promo, and lets a deal be both CC and EPC", () => {
    const both = item({ ccRatePct: 12, epc: 0.4 });
    expect(matchesTab(both, "cc")).toBe(true);
    expect(matchesTab(both, "epc")).toBe(true);
    expect(matchesTab(both, "promo")).toBe(false);
    expect(matchesTab(item({ hasPromo: true }), "promo")).toBe(true);
    expect(matchesTab(item(), "all")).toBe(true);
    expect(matchesTab(item(), "cc")).toBe(false);
  });
});

describe("matchesFilters", () => {
  it("excludes rows with an unknown value once a minimum is set", () => {
    expect(matchesFilters(item({ discountPct: null }), { ...NO_FILTERS, minDiscount: 10 })).toBe(false);
    expect(matchesFilters(item({ discountPct: 25 }), { ...NO_FILTERS, minDiscount: 10 })).toBe(true);
    expect(matchesFilters(item({ ccRatePct: 8 }), { ...NO_FILTERS, minCommission: 10 })).toBe(false);
    expect(matchesFilters(item({ epc: 0.5 }), { ...NO_FILTERS, minEpc: 0.25 })).toBe(true);
  });

  it("applies the price cap only to rows that have a price", () => {
    expect(matchesFilters(item({ priceCents: 3000 }), { ...NO_FILTERS, maxPrice: 25 })).toBe(false);
    expect(matchesFilters(item({ priceCents: 2000 }), { ...NO_FILTERS, maxPrice: 25 })).toBe(true);
    expect(matchesFilters(item({ priceCents: null }), { ...NO_FILTERS, maxPrice: 25 })).toBe(true);
  });

  it("requires a promo when asked", () => {
    expect(matchesFilters(item(), { ...NO_FILTERS, onlyPromo: true })).toBe(false);
    expect(matchesFilters(item({ hasPromo: true }), { ...NO_FILTERS, onlyPromo: true })).toBe(true);
  });
});

describe("buildCatalogView", () => {
  const rows = [
    { id: "a", i: item({ ccRatePct: 5, epc: 0.1, order: 0 }) },
    { id: "b", i: item({ ccRatePct: 20, order: 1 }) },
    { id: "c", i: item({ epc: 0.9, order: 2 }) },
    { id: "d", i: item({ order: 3 }) },
  ];
  const get = (r: { i: CatalogItem }) => r.i;

  it("filters by tab then sorts high to low, unknowns last", () => {
    expect(buildCatalogView(rows, get, "cc", NO_FILTERS, "commission").map((r) => r.id)).toEqual(["b", "a"]);
    expect(buildCatalogView(rows, get, "all", NO_FILTERS, "epc").map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps harvest order for newest and does not mutate the input", () => {
    const copy = [...rows];
    expect(buildCatalogView(rows, get, "all", NO_FILTERS, "newest").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows).toEqual(copy);
  });
});

describe("tabCounts", () => {
  it("counts each tab", () => {
    const rows = [item({ ccRatePct: 1 }), item({ epc: 1, ccRatePct: 2 }), item({ hasPromo: true }), item()];
    expect(tabCounts(rows, (r) => r)).toEqual({ all: 4, cc: 2, epc: 1, promo: 1 });
  });
});
