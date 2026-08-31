import { describe, expect, it } from "vitest";
import {
  EST_PLACEHOLDER,
  estimateMonthly,
  estimateMonthlyUnits,
  formatEstRevenue,
  formatEstUnits,
  parsePrice,
  parseSalesRank,
  resolveEstimate,
} from "./bsr-revenue-estimator";

describe("estimateMonthlyUnits", () => {
  it("returns a positive estimate for a mid-list rank", () => {
    const units = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" });
    expect(units).not.toBeNull();
    expect(units!).toBeGreaterThan(0);
  });

  it("returns a smaller estimate for a worse rank", () => {
    const better = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" })!;
    const worse = estimateMonthlyUnits({ salesRank: 55459, category: "Home & Kitchen" })!;
    expect(worse).toBeLessThan(better);
  });

  it("applies the category multiplier", () => {
    const kitchen = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" })!;
    const books = estimateMonthlyUnits({ salesRank: 5919, category: "Books" })!;
    // Home & Kitchen is 1.6x, Books is 0.5x, so kitchen must be larger.
    expect(kitchen).toBeGreaterThan(books);
  });

  it("is null when the rank is missing or invalid", () => {
    expect(estimateMonthlyUnits({})).toBeNull();
    expect(estimateMonthlyUnits({ salesRank: null })).toBeNull();
    expect(estimateMonthlyUnits({ salesRank: 0 })).toBeNull();
    expect(estimateMonthlyUnits({ salesRank: "not a rank" })).toBeNull();
  });

  it("uses a real bought-in-past-month figure directly, ignoring the curve", () => {
    expect(estimateMonthlyUnits({ salesRank: 5919, boughtPastMonth: 900 })).toBe(900);
    // Even with no rank, a real figure wins.
    expect(estimateMonthlyUnits({ boughtPastMonth: 900 })).toBe(900);
  });

  it("parses a '#1,234 in Category' rank string", () => {
    const fromString = estimateMonthlyUnits({ salesRank: "#5,919 in Home & Kitchen", category: "Home & Kitchen" });
    const fromNumber = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" });
    expect(fromString).toBe(fromNumber);
  });
});

describe("estimateMonthly", () => {
  it("multiplies estimated units by price", () => {
    const { units, revenue } = estimateMonthly({
      salesRank: 5919,
      price: 109.99,
      category: "Home & Kitchen",
    });
    expect(units).not.toBeNull();
    expect(revenue).not.toBeNull();
    expect(revenue!).toBe(Math.round(units! * 109.99));
    expect(revenue!).toBeGreaterThan(0);
  });

  it("parses a '$12.99' price string", () => {
    const { revenue } = estimateMonthly({ salesRank: 5919, price: "$109.99", category: "Home & Kitchen" });
    const { revenue: numeric } = estimateMonthly({ salesRank: 5919, price: 109.99, category: "Home & Kitchen" });
    expect(revenue).toBe(numeric);
  });

  it("has null revenue when the price is unknown", () => {
    const { units, revenue } = estimateMonthly({ salesRank: 5919, category: "Home & Kitchen" });
    expect(units).not.toBeNull();
    expect(revenue).toBeNull();
  });

  it("has null units and revenue when the rank is unknown", () => {
    const { units, revenue } = estimateMonthly({ price: 109.99 });
    expect(units).toBeNull();
    expect(revenue).toBeNull();
  });
});

describe("resolveEstimate", () => {
  it("prefers the server units over the local estimate", () => {
    const local = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" })!;
    const { units } = resolveEstimate({
      serverUnits: 1234,
      salesRank: 5919,
      priceCents: 10999,
      category: "Home & Kitchen",
    });
    expect(units).toBe(1234);
    expect(units).not.toBe(local);
  });

  it("falls back to the local estimate when there is no server value", () => {
    const local = estimateMonthlyUnits({ salesRank: 5919, category: "Home & Kitchen" })!;
    const { units } = resolveEstimate({
      serverUnits: null,
      salesRank: 5919,
      priceCents: 10999,
      category: "Home & Kitchen",
    });
    expect(units).toBe(local);
  });

  it("converts price cents to whole-dollar revenue", () => {
    const { units, revenueDollars } = resolveEstimate({ serverUnits: 1000, priceCents: 10999 });
    expect(units).toBe(1000);
    expect(revenueDollars).toBe(Math.round((1000 * 10999) / 100)); // 109990
  });

  it("has null revenue when there is no price", () => {
    const { units, revenueDollars } = resolveEstimate({ serverUnits: 1000, priceCents: null });
    expect(units).toBe(1000);
    expect(revenueDollars).toBeNull();
  });

  it("has null units and revenue when nothing is known", () => {
    const { units, revenueDollars } = resolveEstimate({ priceCents: 10999 });
    expect(units).toBeNull();
    expect(revenueDollars).toBeNull();
  });
});

describe("parsers", () => {
  it("parseSalesRank handles numbers, strings, and junk", () => {
    expect(parseSalesRank(5919)).toBe(5919);
    expect(parseSalesRank("#5,919 in Home & Kitchen")).toBe(5919);
    expect(parseSalesRank(0)).toBeNull();
    expect(parseSalesRank(null)).toBeNull();
    expect(parseSalesRank("no digits")).toBeNull();
  });

  it("parsePrice handles numbers, strings, and junk", () => {
    expect(parsePrice(109.99)).toBe(109.99);
    expect(parsePrice("$109.99")).toBe(109.99);
    expect(parsePrice("1,299.00")).toBe(1299);
    expect(parsePrice(0)).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe("formatters", () => {
  it("formatEstUnits uses thousands separators or the placeholder", () => {
    expect(formatEstUnits(1015)).toBe("1,015");
    expect(formatEstUnits(null)).toBe(EST_PLACEHOLDER);
  });

  it("formatEstRevenue prefixes a dollar sign or shows the placeholder", () => {
    expect(formatEstRevenue(111750)).toBe("$111,750");
    expect(formatEstRevenue(null)).toBe(EST_PLACEHOLDER);
  });
});
