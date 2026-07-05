import { describe, expect, it } from "vitest";
import { criteriaToRecord, evaluateApproved } from "./criteria";
import type { ProductSignals } from "../../amazon/product-signals";
import type { VideoCounts } from "../../transport/types";

const settings = { minBoughtPerMonth: 50, maxInfluencerVideos: 5, minPrice: 20 };

const goodSignals: ProductSignals = {
  asin: "B000TEST01",
  marketplace: "amazon.com",
  title: "Test product",
  priceCents: 3999,
  currency: "USD",
  inStock: true,
  boughtPastMonth: 200,
  brand: "TestBrand",
  commissionRatePct: null,
  imageUrl: null,
};

const lowCompetition: VideoCounts = { total: 4, influencer: 2, brand: 1, customer: 1, unknown: 0 };

describe("evaluateApproved", () => {
  it("approves when all four criteria pass", () => {
    const verdict = evaluateApproved(goodSignals, lowCompetition, settings);
    expect(verdict.approved).toBe(true);
    expect(verdict.criteria).toHaveLength(4);
    expect(verdict.criteria.every((c) => c.state === "pass")).toBe(true);
  });

  it("fails on crowded influencer carousels", () => {
    const crowded = { ...lowCompetition, influencer: 6 };
    const verdict = evaluateApproved(goodSignals, crowded, settings);
    expect(verdict.approved).toBe(false);
    expect(verdict.criteria.find((c) => c.key === "openSlot")?.state).toBe("fail");
  });

  it("reports unknown instead of guessing when signals are missing", () => {
    const verdict = evaluateApproved(
      { ...goodSignals, boughtPastMonth: null, priceCents: null },
      null,
      settings,
    );
    expect(verdict.approved).toBe(false);
    const states = Object.fromEntries(verdict.criteria.map((c) => [c.key, c.state]));
    expect(states.activelySelling).toBe("unknown");
    expect(states.openSlot).toBe("unknown");
    expect(states.priceFloor).toBe("unknown");
    expect(states.inStock).toBe("pass");
  });

  it("fails out-of-stock products", () => {
    const verdict = evaluateApproved({ ...goodSignals, inStock: false }, lowCompetition, settings);
    expect(verdict.criteria.find((c) => c.key === "inStock")?.state).toBe("fail");
  });
});

describe("criteriaToRecord", () => {
  it("maps pass to true and everything else to false", () => {
    const verdict = evaluateApproved(
      { ...goodSignals, boughtPastMonth: null },
      lowCompetition,
      settings,
    );
    const record = criteriaToRecord(verdict);
    expect(record.activelySelling).toBe(false);
    expect(record.openSlot).toBe(true);
  });
});
