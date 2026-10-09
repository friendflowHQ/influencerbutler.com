import { describe, expect, it } from "vitest";
import { buildAiPostFacts, cleanBrand } from "./facts";
import type { ProductSignals } from "../../amazon/product-signals";

function signals(over: Partial<ProductSignals>): ProductSignals {
  return {
    asin: "B000000000",
    marketplace: "www.amazon.com",
    title: "Mild Moisture Body Lotion",
    priceCents: 899,
    currency: "USD",
    listPriceCents: 1199,
    dealKind: null,
    inStock: true,
    boughtPastMonth: null,
    brand: "Visit the Cetaphil Store",
    commissionRatePct: null,
    category: null,
    parentAsin: null,
    variationAsins: [],
    bestsellerRank: null,
    listedAt: null,
    sellerCount: null,
    imageUrl: null,
    ...over,
  };
}

describe("buildAiPostFacts", () => {
  it("derives percent off and cleans the brand, with no price in the facts", () => {
    const f = buildAiPostFacts(signals({}));
    expect(f.percentOff).toBe(25);
    expect(f.brand).toBe("Cetaphil");
    expect(f.store).toBe("Amazon");
    expect(JSON.stringify(f)).not.toMatch(/899|8\.99|\$/);
  });

  it("maps a coupon to couponPercentOff and a code to promoPercentOff", () => {
    const coupon = buildAiPostFacts(signals({ promo: { kind: "coupon", percent: 15, cents: null, code: null, text: "Save 15%" } }));
    expect(coupon.couponPercentOff).toBe(15);
    expect(coupon.promoPercentOff).toBeNull();
    const code = buildAiPostFacts(signals({ promo: { kind: "code", percent: 10, cents: null, code: "SAVE10", text: "Extra 10% off with code SAVE10" } }));
    expect(code.promoPercentOff).toBe(10);
    expect(code.promoCode).toBe("SAVE10");
    expect(code.couponPercentOff).toBeNull();
  });

  it("turns a flat-dollar coupon into a percent of the price", () => {
    const f = buildAiPostFacts(signals({ promo: { kind: "coupon", percent: null, cents: 90, code: null, text: "Apply $0.90 coupon" } }));
    expect(f.couponPercentOff).toBe(10);
  });

  it("ignores a sub-threshold strikethrough and names a lightning deal", () => {
    const f = buildAiPostFacts(signals({ listPriceCents: 920, dealKind: "lightning" }));
    expect(f.percentOff).toBeNull();
    expect(f.event).toBe("Lightning Deal");
  });
});

describe("cleanBrand", () => {
  it("strips Amazon byline boilerplate", () => {
    expect(cleanBrand("Brand: Acme")).toBe("Acme");
    expect(cleanBrand(null)).toBeNull();
  });
});
