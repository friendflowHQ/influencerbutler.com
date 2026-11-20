import { describe, expect, it } from "vitest";
import { computeButlerScore, type ScoreInputs } from "./model";
import { explainScore, topReasons } from "./explain";
import { DEFAULTS } from "../../storage/schema";

const settings = DEFAULTS.settings;

const base: ScoreInputs = {
  priceCents: 4000,
  commissionRatePct: 10,
  influencerVideos: null,
  boughtPastMonth: null,
  reviewCount: null,
  inStock: null,
  membership: { cc: false, spcc: false },
};

describe("explainScore", () => {
  it("names commission and campaign for a campaign product with strong commission", () => {
    const score = computeButlerScore({ ...base, priceCents: 9000, commissionRatePct: 12, membership: { cc: true, spcc: false } }, settings);
    const parts = topReasons(score);
    expect(parts).toContain("commission");
    expect(parts).toContain("campaign");
    expect(parts.length).toBeLessThanOrEqual(2);
  });

  it("never claims unknown (neutral) signals as strengths", () => {
    const score = computeButlerScore(
      { ...base, priceCents: null, commissionRatePct: null, membership: { cc: true, spcc: false } },
      settings,
    );
    const parts = topReasons(score);
    expect(parts).not.toContain("commission");
    expect(parts).not.toContain("slot");
    expect(parts).not.toContain("demand");
  });

  it("returns no reasons for a low score", () => {
    const score = computeButlerScore({ ...base, priceCents: 100, commissionRatePct: 1, inStock: false }, settings);
    expect(score.score).toBeLessThan(40);
    expect(explainScore(score, { estimated: false, locale: "en" })).toBe("");
  });

  it("adds the estimated marker and localizes", () => {
    const score = computeButlerScore({ ...base, priceCents: 9000, commissionRatePct: 12, membership: { cc: true, spcc: false } }, settings);
    expect(explainScore(score, { estimated: true, locale: "en" })).toMatch(/\(estimated\)$/);
    expect(explainScore(score, { estimated: false, locale: "es" })).toMatch(/comision|campana/);
  });
});
