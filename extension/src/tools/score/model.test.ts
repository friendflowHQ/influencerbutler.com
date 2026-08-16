import { describe, expect, it } from "vitest";
import { bandFor, computeButlerScore, type ScoreInputs } from "./model";
import { DEFAULTS } from "../../storage/schema";

// approved thresholds: minBoughtPerMonth 50, maxInfluencerVideos 5, minPrice 20.
const settings = DEFAULTS.settings;

const strong: ScoreInputs = {
  priceCents: 3999,
  commissionRatePct: 5,
  influencerVideos: 0,
  boughtPastMonth: 400,
  reviewCount: null,
  inStock: true,
  membership: { cc: true, spcc: false },
};

describe("computeButlerScore", () => {
  it("scores a strong product hot", () => {
    const result = computeButlerScore(strong, settings);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("hot");
  });

  it("scores a weak product cool", () => {
    const weak: ScoreInputs = {
      priceCents: 500,
      commissionRatePct: 1,
      influencerVideos: 20,
      boughtPastMonth: 0,
      reviewCount: null,
      inStock: false,
      membership: { cc: false, spcc: false },
    };
    const result = computeButlerScore(weak, settings);
    expect(result.band).toBe("cool");
    expect(result.score).toBeLessThan(40);
  });

  it("treats missing signals as neutral, not a penalty", () => {
    const bare: ScoreInputs = {
      priceCents: null,
      commissionRatePct: null,
      influencerVideos: null,
      boughtPastMonth: null,
      reviewCount: null,
      inStock: null,
      membership: { cc: false, spcc: false },
    };
    const result = computeButlerScore(bare, settings);
    // Every scored component neutral (0.5) except the campaign bonus (absent,
    // 0), so around the mid-40s: clearly warm, not sunk to zero.
    expect(result.score).toBeGreaterThan(35);
    expect(result.score).toBeLessThan(55);
  });

  it("gives a campaign-eligible product a bonus over an identical one without", () => {
    const withCampaign = computeButlerScore(strong, settings);
    const without = computeButlerScore(
      { ...strong, membership: { cc: false, spcc: false } },
      settings,
    );
    expect(withCampaign.score).toBeGreaterThan(without.score);
    expect(withCampaign.parts.campaign).toBeGreaterThan(0);
    expect(without.parts.campaign).toBe(0);
  });

  it("parts sum to the rounded score", () => {
    const result = computeButlerScore(strong, settings);
    const sum = Object.values(result.parts).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(result.score);
  });
});

describe("review-count demand fallback", () => {
  it("uses reviews when bought-per-month is absent, capped at 0.7", () => {
    const base = { ...strong, boughtPastMonth: null, reviewCount: null };
    const withReviews = computeButlerScore({ ...base, reviewCount: 5000 }, settings);
    // 5000 reviews clamps to the 0.7 cap: 0.7 * 20 demand points.
    expect(withReviews.parts.demand).toBeCloseTo(14, 5);
  });

  it("ignores reviews when bought-per-month is present", () => {
    const withBoth = computeButlerScore({ ...strong, reviewCount: 1 }, settings);
    const withoutReviews = computeButlerScore(strong, settings);
    expect(withBoth.parts.demand).toBe(withoutReviews.parts.demand);
  });

  it("stays neutral when both demand signals are missing", () => {
    const neither = computeButlerScore(
      { ...strong, boughtPastMonth: null, reviewCount: null },
      settings,
    );
    expect(neither.parts.demand).toBeCloseTo(10, 5);
  });
});

describe("bandFor", () => {
  it("uses 70 and 40 as the band thresholds", () => {
    expect(bandFor(70)).toBe("hot");
    expect(bandFor(69)).toBe("warm");
    expect(bandFor(40)).toBe("warm");
    expect(bandFor(39)).toBe("cool");
  });
});
