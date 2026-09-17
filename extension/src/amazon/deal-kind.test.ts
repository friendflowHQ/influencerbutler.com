import { describe, expect, it } from "vitest";
import { parseDealBadgeText } from "./deal-kind";

describe("parseDealBadgeText", () => {
  it("maps Prime Day and Prime Big Deal Days to primeday", () => {
    expect(parseDealBadgeText("Prime Big Deal Days")).toBe("primeday");
    expect(parseDealBadgeText("Prime Day Deal")).toBe("primeday");
    expect(parseDealBadgeText("PRIME DAY")).toBe("primeday");
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
