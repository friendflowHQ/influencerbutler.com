import { describe, expect, it } from "vitest";
import {
  parseBoughtText,
  parsePriceText,
  parseRatingText,
  parseReviewCountText,
} from "./search-results";

describe("parsePriceText", () => {
  it("reads dollars and cents", () => {
    expect(parsePriceText("$19.99")).toEqual({ priceCents: 1999, currency: "USD" });
  });

  it("reads thousands separators and whole-dollar prices", () => {
    expect(parsePriceText("$1,299")).toEqual({ priceCents: 129900, currency: "USD" });
  });

  it("detects non-USD currencies", () => {
    expect(parsePriceText("£8.50").currency).toBe("GBP");
    expect(parsePriceText("€12,00").currency).toBe("EUR");
  });

  it("returns null when there is no price", () => {
    expect(parsePriceText("No price")).toEqual({ priceCents: null, currency: "USD" });
  });

  it("keeps amazon.com parsing unchanged when the marketplace is passed", () => {
    expect(parsePriceText("$19.99", "amazon.com")).toEqual({ priceCents: 1999, currency: "USD" });
    expect(parsePriceText("$1,299", "amazon.com")).toEqual({ priceCents: 129900, currency: "USD" });
    expect(parsePriceText("No price", "amazon.com")).toEqual({ priceCents: null, currency: "USD" });
  });

  it("reads other marketplaces' formats", () => {
    expect(parsePriceText("£8.50", "amazon.co.uk")).toEqual({ priceCents: 850, currency: "GBP" });
    expect(parsePriceText("12,99 €", "amazon.de")).toEqual({ priceCents: 1299, currency: "EUR" });
    expect(parsePriceText("€12,00")).toEqual({ priceCents: 1200, currency: "EUR" });
    expect(parsePriceText("¥1,280", "amazon.co.jp")).toEqual({ priceCents: 128000, currency: "JPY" });
    expect(parsePriceText("₹499", "amazon.in")).toEqual({ priceCents: 49900, currency: "INR" });
    expect(parsePriceText("R$ 49,90", "amazon.com.br")).toEqual({ priceCents: 4990, currency: "BRL" });
    expect(parsePriceText("$24.99", "amazon.ca")).toEqual({ priceCents: 2499, currency: "CAD" });
  });

  it("defaults a missing price's currency to the marketplace", () => {
    expect(parsePriceText("No price", "amazon.co.uk")).toEqual({ priceCents: null, currency: "GBP" });
  });
});

describe("parseBoughtText", () => {
  it("reads a plain count", () => {
    expect(parseBoughtText("500+ bought in past month")).toBe(500);
  });

  it("expands the K suffix", () => {
    expect(parseBoughtText("2K+ bought in past month")).toBe(2000);
  });

  it("returns null when the phrase is absent", () => {
    expect(parseBoughtText("Best seller")).toBeNull();
  });
});

describe("parseRatingText", () => {
  it("reads the US star alt text", () => {
    expect(parseRatingText("4.3 out of 5 stars")).toBe(4.3);
  });

  it("reads Spanish and French formats with a decimal comma", () => {
    expect(parseRatingText("4,3 de 5 estrellas")).toBe(4.3);
    expect(parseRatingText("4,3 sur 5 etoiles")).toBe(4.3);
  });

  it("accepts a bare leading value", () => {
    expect(parseRatingText("4.7")).toBe(4.7);
  });

  it("rejects out-of-range values and non-ratings", () => {
    expect(parseRatingText("7.5 out of 5 stars")).toBeNull();
    expect(parseRatingText("Prime")).toBeNull();
    expect(parseRatingText("")).toBeNull();
  });
});

describe("parseReviewCountText", () => {
  it("expands the K suffix inside parentheses", () => {
    expect(parseReviewCountText("(4.9K)")).toBe(4900);
  });

  it("reads a decimal-comma K form", () => {
    expect(parseReviewCountText("4,9 k")).toBe(4900);
  });

  it("treats separators as thousands groups without a K", () => {
    expect(parseReviewCountText("1,234")).toBe(1234);
    expect(parseReviewCountText("(123)")).toBe(123);
  });

  it("returns null for non-counts", () => {
    expect(parseReviewCountText("")).toBeNull();
    expect(parseReviewCountText("Save 5%")).toBeNull();
  });
});
