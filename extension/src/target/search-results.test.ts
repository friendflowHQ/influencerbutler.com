import { describe, expect, it } from "vitest";
import {
  parseTargetWasPriceCents,
  tcinFromFocusId,
  parseTargetPriceCents,
  parseTargetRating,
  parseTargetReviewCount,
  tcinFromHref,
} from "./search-results";

describe("parseTargetPriceCents", () => {
  it("reads a plain price", () => {
    expect(parseTargetPriceCents("$19.99")).toBe(1999);
    expect(parseTargetPriceCents("$1,299.00")).toBe(129900);
  });
  it("reads a whole-dollar price", () => {
    expect(parseTargetPriceCents("$5")).toBe(500);
  });
  it("reads the low end of a range", () => {
    expect(parseTargetPriceCents("$19.99 - $29.99")).toBe(1999);
  });
  it("reads a reference price", () => {
    expect(parseTargetPriceCents("Reg $24.99")).toBe(2499);
  });
  it("returns null when there is no price", () => {
    expect(parseTargetPriceCents("See price in cart")).toBeNull();
    expect(parseTargetPriceCents("")).toBeNull();
  });
});

describe("parseTargetRating / parseTargetReviewCount", () => {
  const text = "4.5 out of 5 stars with 1,234 ratings";
  it("reads the rating and count from the ratings label", () => {
    expect(parseTargetRating(text)).toBe(4.5);
    expect(parseTargetReviewCount(text)).toBe(1234);
  });
  it("reads a bare parenthesised count", () => {
    expect(parseTargetReviewCount("(87)")).toBe(87);
  });
  it("returns null for unrelated text", () => {
    expect(parseTargetRating("no rating")).toBeNull();
    expect(parseTargetReviewCount("no rating")).toBeNull();
    expect(parseTargetRating("9 out of 5")).toBeNull();
  });
});

describe("tcinFromHref", () => {
  it("pulls the tcin from a product link", () => {
    expect(tcinFromHref("/p/cheerios-cereal/-/A-79344798")).toBe("79344798");
    expect(tcinFromHref("https://www.target.com/p/-/A-79344798?preselect=1#x")).toBe("79344798");
  });
  it("ignores non-product links and malformed ids", () => {
    expect(tcinFromHref("/c/cereal/-/N-5xt1d")).toBeNull();
    expect(tcinFromHref("/p/x/-/A-12")).toBeNull();
    expect(tcinFromHref("")).toBeNull();
  });
});

describe("live listing-card shapes (verified 2026-10-18)", () => {
  it("reads the tcin from data-focusid", () => {
    expect(tcinFromFocusId("81875472_product_card")).toBe("81875472");
    expect(tcinFromFocusId("1010134064_product_card")).toBe("1010134064");
    expect(tcinFromFocusId("81875472")).toBeNull();
    expect(tcinFromFocusId("12_product_card")).toBeNull();
  });

  it("reads price and unit price blocks", () => {
    expect(parseTargetPriceCents("$5.29 ($0.28/ounce)")).toBe(529);
    expect(parseTargetPriceCents("$4.99 - $24.99")).toBe(499);
    expect(parseTargetWasPriceCents("$5.29 ($0.28/ounce)")).toBeNull();
  });

  it("reads a markdown's was price, with or without spaces", () => {
    expect(parseTargetWasPriceCents("$3.29 was $3.49 ($0.30/ounce)")).toBe(349);
    expect(parseTargetWasPriceCents("$3.29was$3.49")).toBe(349);
    expect(parseTargetWasPriceCents("$3.29 Reg $3.99")).toBe(399);
  });

  it("reads the rating-stars aria label", () => {
    const label = "Average customer rating is 4.8 out of 5 stars with 7680 reviews.";
    expect(parseTargetRating(label)).toBe(4.8);
    expect(parseTargetReviewCount(label)).toBe(7680);
  });
});
