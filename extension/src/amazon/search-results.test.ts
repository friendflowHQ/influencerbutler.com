import { describe, expect, it } from "vitest";
import { parseBoughtText, parsePriceText } from "./search-results";

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
