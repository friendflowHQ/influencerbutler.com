import { describe, expect, it } from "vitest";
import { cardDealFacts, parseCardText, CARD_TEXT_MAX } from "./card-text";

describe("parseCardText", () => {
  it("reads a code plus a percent coupon", () => {
    const f = parseCardText("43% off Code: G4CYUJWV + 15% Coupon");
    expect(f).toMatchObject({ promoCode: "G4CYUJWV", promoPercentOff: 43, couponPercentOff: 15, couponClip: true });
  });

  it("reads a code with no coupon", () => {
    const f = parseCardText("50% off Code: 2HMGQI61");
    expect(f).toEqual({ promoCode: "2HMGQI61", promoPercentOff: 50 });
  });

  it("reads a flat dollar coupon", () => {
    const f = parseCardText("20% off Code: ABC123 + $5 coupon");
    expect(f).toMatchObject({ promoPercentOff: 20, couponAmountOff: 5, couponClip: true });
    expect(f.couponPercentOff).toBeUndefined();
  });

  it("treats a bare Coupon as clip only", () => {
    const f = parseCardText("30% off Code: ABCD1234 + Coupon");
    expect(f.couponClip).toBe(true);
    expect(f.couponPercentOff).toBeUndefined();
    expect(f.couponAmountOff).toBeUndefined();
  });

  it("never treats a second code as the coupon", () => {
    const f = parseCardText("30% off Code: ABCD1234 + Code: ZZZZ9999");
    expect(f.couponClip).toBeUndefined();
  });

  it("reads Reg price", () => {
    expect(parseCardText("13.99(Reg.24.99)").originalPrice).toBe(24.99);
  });

  it("takes the low end of a Reg range", () => {
    expect(parseCardText("12.49-13.49(Reg.24.99-26.99)").originalPrice).toBe(24.99);
  });

  it("handles the full one-line card", () => {
    const f = parseCardText("40% off Code: 3R139Z4Y + 10% Coupon / 12.49-13.49(Reg.24.99-26.99)");
    expect(f).toEqual({
      promoCode: "3R139Z4Y",
      promoPercentOff: 40,
      couponPercentOff: 10,
      couponClip: true,
      originalPrice: 24.99,
    });
  });

  it("omits every field for a plain card", () => {
    expect(parseCardText("Nice stainless water bottle, free shipping")).toEqual({});
    expect(parseCardText("")).toEqual({});
  });
});

describe("cardDealFacts", () => {
  it("always carries trimmed, capped cardText", () => {
    expect(cardDealFacts("  hello  ").cardText).toBe("hello");
    expect(cardDealFacts("x".repeat(2000)).cardText).toHaveLength(CARD_TEXT_MAX);
  });

  it("omits cardText for an empty card", () => {
    expect(cardDealFacts("   ")).toEqual({});
  });
});
