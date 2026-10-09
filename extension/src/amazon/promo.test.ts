import { describe, expect, it } from "vitest";
import { parsePromoText } from "./promo";

describe("parsePromoText", () => {
  it("reads a percent coupon", () => {
    expect(parsePromoText("Save 15% with coupon Terms")).toMatchObject({ kind: "coupon", percent: 15, cents: null, code: null });
  });

  it("reads a dollar coupon", () => {
    expect(parsePromoText("Apply $2.50 coupon")).toMatchObject({ kind: "coupon", percent: null, cents: 250 });
  });

  it("reads a promo code and its percent", () => {
    expect(parsePromoText("Extra 10% off with code SAVE10")).toMatchObject({ kind: "code", percent: 10, code: "SAVE10" });
  });

  it("classifies a bare discount message as a promo", () => {
    expect(parsePromoText("Save 5% when you buy 2")).toMatchObject({ kind: "promo", percent: 5 });
  });

  it("ignores text that states no discount", () => {
    expect(parsePromoText("Terms")).toBeNull();
    expect(parsePromoText("Shop items")).toBeNull();
    expect(parsePromoText("4.5 out of 5 stars")).toBeNull();
  });
});
