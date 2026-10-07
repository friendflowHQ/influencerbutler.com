import { describe, expect, it } from "vitest";
import { dealDiscountPct, isTypicalPriceLabel, parseDealBadgeText } from "./deal-kind";

describe("parseDealBadgeText", () => {
  it("maps Prime Day and Prime Big Deal Days to primeday", () => {
    expect(parseDealBadgeText("Prime Big Deal Days")).toBe("primeday");
    expect(parseDealBadgeText("Prime Day Deal")).toBe("primeday");
    expect(parseDealBadgeText("PRIME DAY")).toBe("primeday");
    expect(parseDealBadgeText("Prime Big Deal")).toBe("primeday");
  });

  it("maps Lightning Deal to lightning", () => {
    expect(parseDealBadgeText("Lightning Deal")).toBe("lightning");
    expect(parseDealBadgeText("lightning deal - 20% claimed")).toBe("lightning");
  });

  it("maps a coupon badge to coupon", () => {
    expect(parseDealBadgeText("Save 5% with coupon")).toBe("coupon");
  });

  it("falls back to reduced for a generic deal / % off / limited time", () => {
    expect(parseDealBadgeText("Limited time deal")).toBe("reduced");
    expect(parseDealBadgeText("Deal")).toBe("reduced");
    expect(parseDealBadgeText("-32%")).toBe("reduced");
    expect(parseDealBadgeText("20% off")).toBe("reduced");
  });

  it("returns null for a non-deal badge", () => {
    expect(parseDealBadgeText("Best Seller")).toBeNull();
    expect(parseDealBadgeText("Amazon's Choice")).toBeNull();
    expect(parseDealBadgeText("")).toBeNull();
  });
});

describe("dealDiscountPct", () => {
  it("computes the cut from the strike price", () => {
    expect(dealDiscountPct(24699, 42999)).toBe(43);
  });

  it("ignores a strike price only a few percent above the price", () => {
    expect(dealDiscountPct(40799, 42999)).toBeNull();
  });

  it("is null with no strike price or no cut", () => {
    expect(dealDiscountPct(24699, null)).toBeNull();
    expect(dealDiscountPct(null, 42999)).toBeNull();
    expect(dealDiscountPct(42999, 42999)).toBeNull();
  });
});

describe("isTypicalPriceLabel", () => {
  it("flags Typical price but not List Price", () => {
    expect(isTypicalPriceLabel("Typical price: $429.99")).toBe(true);
    expect(isTypicalPriceLabel("Typical: $599.99$599.99")).toBe(true);
    expect(isTypicalPriceLabel("List Price: $429.99")).toBe(false);
    expect(isTypicalPriceLabel("$429.99")).toBe(false);
  });
});
