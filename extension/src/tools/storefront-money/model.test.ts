import { describe, expect, it } from "vitest";
import { currencyForMarketplace, floatOrders, floatRank, summarizeCard } from "./model";

const cc = (ratePct: number) => ({ ratePct, brand: null, endsAt: null });
const spcc = (epc: number) => ({ epc, budgetAvailability: null, brand: null });

describe("summarizeCard", () => {
  it("returns null when no tagged product is in a campaign", () => {
    expect(
      summarizeCard({
        asins: ["B000000001", "B000000002"],
        ccFlagged: new Set(),
        spccFlagged: new Set(),
        ccRates: {},
        spccRates: {},
      }),
    ).toBeNull();
  });

  it("picks the highest CC rate and counts every flagged product", () => {
    const out = summarizeCard({
      asins: ["B000000001", "B000000002", "B000000003"],
      ccFlagged: new Set(["B000000001", "B000000002"]),
      spccFlagged: new Set(),
      ccRates: { B000000001: cc(8), B000000002: cc(12) },
      spccRates: {},
    });
    expect(out?.cc?.rate?.ratePct).toBe(12);
    expect(out?.cc?.count).toBe(2);
    expect(out?.spcc).toBeNull();
  });

  it("keeps a plain flagged campaign while the rate lookup is pending", () => {
    const out = summarizeCard({
      asins: ["B000000001"],
      ccFlagged: new Set(["B000000001"]),
      spccFlagged: new Set(),
      ccRates: {},
      spccRates: {},
    });
    expect(out?.cc).toEqual({ rate: null, count: 1 });
  });

  it("picks the highest SPCC $/click independently of CC", () => {
    const out = summarizeCard({
      asins: ["B000000001", "B000000002"],
      ccFlagged: new Set(["B000000001"]),
      spccFlagged: new Set(["B000000001", "B000000002"]),
      ccRates: { B000000001: cc(10) },
      spccRates: { B000000001: spcc(0.2), B000000002: spcc(0.9) },
    });
    expect(out?.cc?.rate?.ratePct).toBe(10);
    expect(out?.spcc?.rate?.epc).toBe(0.9);
    expect(out?.spcc?.count).toBe(2);
    expect(out?.products).toBe(2);
  });
});

describe("currencyForMarketplace", () => {
  it("maps marketplaces to currencies", () => {
    expect(currencyForMarketplace("amazon.com")).toBe("USD");
    expect(currencyForMarketplace("amazon.co.uk")).toBe("GBP");
    expect(currencyForMarketplace("amazon.de")).toBe("EUR");
    expect(currencyForMarketplace("amazon.ca")).toBe("CAD");
  });
});

describe("deal flag", () => {
  const base = { ccFlagged: new Set<string>(), spccFlagged: new Set<string>(), ccRates: {}, spccRates: {} };

  it("keeps a card that is only on a deal", () => {
    const out = summarizeCard({ ...base, asins: ["B000000001", "B000000002"], dealFlagged: new Set(["B000000002"]) });
    expect(out?.deal).toEqual({ count: 1 });
    expect(out?.cc).toBeNull();
    expect(out?.products).toBe(1);
  });

  it("counts a product in a campaign and on a deal once", () => {
    const out = summarizeCard({
      ...base,
      asins: ["B000000001"],
      ccFlagged: new Set(["B000000001"]),
      dealFlagged: new Set(["B000000001"]),
    });
    expect(out?.products).toBe(1);
  });
});

describe("floatRank", () => {
  const summary = (cc: boolean, deal: boolean) =>
    ({ cc: cc ? { rate: null, count: 1 } : null, spcc: null, deal: deal ? { count: 1 } : null, products: 1 });

  it("ranks campaign plus deal above campaign above deal above nothing", () => {
    expect(floatRank(summary(true, true))).toBe(3);
    expect(floatRank(summary(true, false))).toBe(2);
    expect(floatRank(summary(false, true))).toBe(1);
    expect(floatRank(null)).toBe(0);
  });
});

describe("floatOrders", () => {
  it("floats ranked cards ahead of the rest, best rank first, DOM order within a rank", () => {
    // DOM order: none, deal, campaign, none, campaign+deal, campaign
    const orders = floatOrders([0, 1, 2, 0, 3, 2]);
    expect(orders).toEqual([0, -1, -3, 0, -4, -2]);
    const visual = orders
      .map((order, index) => ({ order, index }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map((c) => c.index);
    expect(visual).toEqual([4, 2, 5, 1, 0, 3]);
  });

  it("leaves everything at 0 when nothing is ranked", () => {
    expect(floatOrders([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
