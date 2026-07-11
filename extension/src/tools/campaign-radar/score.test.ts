import { describe, expect, it } from "vitest";
import {
  bandFor,
  computeCampaignScore,
  meetsRadarThresholds,
  type CampaignScoreInputs,
  type RadarThresholds,
} from "./score";

const strong: CampaignScoreInputs = {
  commissionRatePct: 18,
  daysRemaining: 40,
  remainingBudgetCents: 5_000_00,
  owned: true,
  provenEarner: true,
};

const thresholds: RadarThresholds = {
  minCommissionPct: 10,
  minDaysRemaining: 7,
  minRemainingBudget: 1000,
};

describe("computeCampaignScore", () => {
  it("scores a strong campaign hot", () => {
    const result = computeCampaignScore(strong);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("hot");
  });

  it("scores a weak campaign cool", () => {
    const weak: CampaignScoreInputs = {
      commissionRatePct: 3,
      daysRemaining: 1,
      remainingBudgetCents: 10_00,
      owned: false,
      provenEarner: false,
    };
    const result = computeCampaignScore(weak);
    expect(result.band).toBe("cool");
    expect(result.score).toBeLessThan(40);
  });

  it("treats missing signals as neutral, not a penalty", () => {
    const bare: CampaignScoreInputs = {
      commissionRatePct: null,
      daysRemaining: null,
      remainingBudgetCents: null,
      owned: null,
      provenEarner: null,
    };
    // Every component neutral (0.5) => right around 50: clearly warm, not sunk.
    const result = computeCampaignScore(bare);
    expect(result.score).toBe(50);
    expect(result.band).toBe("warm");
  });

  it("rewards a product the creator already owns over an identical one they do not", () => {
    const owned = computeCampaignScore(strong);
    const notOwned = computeCampaignScore({ ...strong, owned: false });
    expect(owned.score).toBeGreaterThan(notOwned.score);
    expect(owned.parts.owned).toBeGreaterThan(0);
    expect(notOwned.parts.owned).toBe(0);
  });

  it("clamps an expired campaign's negative days to zero timing", () => {
    const expired = computeCampaignScore({ ...strong, daysRemaining: -5 });
    expect(expired.parts.timing).toBe(0);
  });

  it("saturates commission at the ceiling (30% is no better than 20%)", () => {
    const at = computeCampaignScore({ ...strong, commissionRatePct: 20 });
    const over = computeCampaignScore({ ...strong, commissionRatePct: 30 });
    expect(over.parts.commission).toBe(at.parts.commission);
  });

  it("parts sum to the rounded score", () => {
    const result = computeCampaignScore(strong);
    const sum = Object.values(result.parts).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(result.score);
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

describe("meetsRadarThresholds", () => {
  it("passes a campaign that clears every floor", () => {
    expect(meetsRadarThresholds(strong, thresholds)).toBe(true);
  });

  it("fails a campaign under the commission floor", () => {
    expect(meetsRadarThresholds({ ...strong, commissionRatePct: 5 }, thresholds)).toBe(false);
  });

  it("fails a campaign under the days floor", () => {
    expect(meetsRadarThresholds({ ...strong, daysRemaining: 2 }, thresholds)).toBe(false);
  });

  it("fails a campaign under the budget floor", () => {
    expect(meetsRadarThresholds({ ...strong, remainingBudgetCents: 500_00 }, thresholds)).toBe(
      false,
    );
  });

  it("does not fail a floor on a signal the grid did not surface (null)", () => {
    const partial: CampaignScoreInputs = {
      commissionRatePct: null,
      daysRemaining: null,
      remainingBudgetCents: null,
      owned: null,
      provenEarner: null,
    };
    expect(meetsRadarThresholds(partial, thresholds)).toBe(true);
  });
});
