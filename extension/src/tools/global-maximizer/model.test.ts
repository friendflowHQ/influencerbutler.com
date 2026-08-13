import { describe, expect, it } from "vitest";
import {
  estimateCommissionCents,
  marketAvailability,
  summarizeReach,
  type MarketAvailability,
} from "./model";

describe("marketAvailability", () => {
  it("is notlisted when the market has no offer", () => {
    expect(marketAvailability({ marketplace: "amazon.de", found: false, availability: null, priceCents: null })).toBe(
      "notlisted",
    );
  });

  it("is unavailable when the offer text says so", () => {
    expect(
      marketAvailability({ marketplace: "amazon.de", found: true, availability: "Currently unavailable", priceCents: 999 }),
    ).toBe("unavailable");
    expect(
      marketAvailability({ marketplace: "amazon.fr", found: true, availability: "Out of stock", priceCents: 999 }),
    ).toBe("unavailable");
  });

  it("is available when found with a normal offer", () => {
    expect(
      marketAvailability({ marketplace: "amazon.co.uk", found: true, availability: "In Stock", priceCents: 1999 }),
    ).toBe("available");
    // Found with no availability string still counts as available.
    expect(
      marketAvailability({ marketplace: "amazon.ca", found: true, availability: null, priceCents: 1999 }),
    ).toBe("available");
  });
});

describe("estimateCommissionCents", () => {
  it("computes price times rate", () => {
    expect(estimateCommissionCents(2000, 3)).toBe(60);
    expect(estimateCommissionCents(1999, 2.5)).toBe(50);
  });

  it("returns null when price or rate is missing or negative", () => {
    expect(estimateCommissionCents(null, 3)).toBeNull();
    expect(estimateCommissionCents(2000, null)).toBeNull();
    expect(estimateCommissionCents(-1, 3)).toBeNull();
    expect(estimateCommissionCents(2000, -3)).toBeNull();
  });
});

describe("summarizeReach", () => {
  const rows = (specs: Array<[string, MarketAvailability]>) =>
    specs.map(([code, availability]) => ({ code, availability }));

  it("counts total and abroad availability", () => {
    const out = summarizeReach(
      rows([
        ["US", "available"],
        ["UK", "available"],
        ["DE", "unavailable"],
        ["CA", "available"],
        ["FR", "notlisted"],
      ]),
      "US",
    );
    expect(out).toEqual({ availableTotal: 3, availableAbroad: 2, withData: 5 });
  });

  it("reports zero abroad when only home carries it", () => {
    const out = summarizeReach(rows([["US", "available"], ["UK", "notlisted"]]), "US");
    expect(out).toEqual({ availableTotal: 1, availableAbroad: 0, withData: 2 });
  });
});
