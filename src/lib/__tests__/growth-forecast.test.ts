/**
 * Summary: Unit tests for the growth forecast's pure math - trend derivation
 * (growth rate, run-rate average, conversion rate) and the month-by-month
 * projection roll-forward. The DB-reading computeForecastInputs is not covered
 * here; these are the deterministic pieces the assumption sliders depend on.
 * Dependencies: vitest, ../growth-forecast.
 */

import { describe, it, expect } from "vitest";
import {
  addMonthKey,
  deriveMonthlyGrowth,
  recentAverage,
  deriveConversionRate,
  projectForward,
  defaultAssumptions,
  DEFAULT_CHURN_RATE,
  DEFAULT_CONVERSION_RATE,
  MAX_MONTHS_AHEAD,
  type ForecastBaseline,
} from "../growth-forecast";

function baseline(over: Partial<ForecastBaseline> = {}): ForecastBaseline {
  return {
    activeNow: 100,
    newSubsPerMonth: 10,
    revenueCentsPerMonth: 100000,
    arpuCents: 1000,
    trialsPerMonth: 20,
    conversionRate: 0.3,
    monthlyGrowth: 0,
    migrationPending: false,
    history: [],
    ...over,
  };
}

describe("addMonthKey", () => {
  it("shifts months in UTC and wraps the year", () => {
    expect(addMonthKey("2026-09", 1)).toBe("2026-10");
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthKey("2026-01", -1)).toBe("2025-12");
    expect(addMonthKey("2026-09", 6)).toBe("2027-03");
  });
});

describe("deriveMonthlyGrowth", () => {
  it("reads compound growth from first to last positive point", () => {
    // 10 -> 12.1 over two steps is +10%/mo compounded.
    expect(deriveMonthlyGrowth([10, 11, 12.1])!).toBeCloseTo(0.1, 5);
  });

  it("ignores nulls and non-positive points, comparing the surviving endpoints", () => {
    // Nulls and the zero drop out, leaving [10, 12.1]: one step, +21%.
    expect(deriveMonthlyGrowth([null, 10, 0, 12.1])!).toBeCloseTo(0.21, 5);
    // A clean three-point +10% series keeps both steps.
    expect(deriveMonthlyGrowth([10, 11, 12.1])!).toBeCloseTo(0.1, 5);
  });

  it("clamps runaway growth to +/-50%/mo", () => {
    expect(deriveMonthlyGrowth([10, 100])).toBe(0.5);
    expect(deriveMonthlyGrowth([100, 10])).toBe(-0.5);
  });

  it("returns null with fewer than two positive points", () => {
    expect(deriveMonthlyGrowth([])).toBeNull();
    expect(deriveMonthlyGrowth([5])).toBeNull();
    expect(deriveMonthlyGrowth([null, 0, null])).toBeNull();
  });
});

describe("recentAverage", () => {
  it("averages the last n non-null values", () => {
    expect(recentAverage([1, 2, 3, 4])).toBe(3); // (2+3+4)/3
    expect(recentAverage([1, 2, 3, 4], 2)).toBe(3.5);
  });

  it("skips nulls and returns null for an all-null series", () => {
    expect(recentAverage([null, 2, null, 4])).toBe(3);
    expect(recentAverage([null, null])).toBeNull();
    expect(recentAverage([])).toBeNull();
  });
});

describe("deriveConversionRate", () => {
  it("pools conversions over trials across months", () => {
    const rate = deriveConversionRate([
      { month: "2026-07", newSubs: null, revenueCents: null, trialsStarted: 10, trialConversions: 3 },
      { month: "2026-08", newSubs: null, revenueCents: null, trialsStarted: 30, trialConversions: 9 },
    ]);
    expect(rate).toBeCloseTo(12 / 40, 5);
  });

  it("is null when there are no trials or no comparable months", () => {
    expect(deriveConversionRate([])).toBeNull();
    expect(
      deriveConversionRate([
        { month: "2026-08", newSubs: null, revenueCents: null, trialsStarted: 0, trialConversions: 0 },
      ]),
    ).toBeNull();
    expect(
      deriveConversionRate([
        { month: "2026-08", newSubs: null, revenueCents: null, trialsStarted: null, trialConversions: null },
      ]),
    ).toBeNull();
  });
});

describe("projectForward", () => {
  it("rolls active subs forward net of churn plus new subs", () => {
    const rows = projectForward(
      baseline(),
      { monthlyGrowth: 0, churnRate: 0.1, conversionRate: 0.5 },
      "2026-09",
      2,
    );
    expect(rows).toHaveLength(2);
    // Month 1: 100 * 0.9 + 10 = 100 active; revenue 100 * $10 = $1000.
    expect(rows[0].month).toBe("2026-10");
    expect(rows[0].monthsAhead).toBe(1);
    expect(rows[0].activeSubs).toBeCloseTo(100, 5);
    expect(rows[0].newSubs).toBeCloseTo(10, 5);
    expect(rows[0].trials).toBeCloseTo(20, 5);
    expect(rows[0].conversions).toBeCloseTo(10, 5); // 20 * 0.5
    expect(rows[0].revenueCents).toBeCloseTo(100000, 5);
    // Month 2: 100 * 0.9 + 10 = 100 again; cumulative is the sum.
    expect(rows[1].month).toBe("2026-11");
    expect(rows[1].activeSubs).toBeCloseTo(100, 5);
    expect(rows[1].cumulativeRevenueCents).toBeCloseTo(200000, 5);
  });

  it("grows new subs and trials geometrically", () => {
    const rows = projectForward(
      baseline({ activeNow: 0 }),
      { monthlyGrowth: 0.1, churnRate: 0, conversionRate: 0 },
      "2026-09",
      2,
    );
    expect(rows[0].newSubs).toBeCloseTo(11, 5); // 10 * 1.1
    expect(rows[1].newSubs).toBeCloseTo(12.1, 5); // 10 * 1.1^2
    expect(rows[1].trials).toBeCloseTo(24.2, 5); // 20 * 1.1^2
  });

  it("clamps the horizon to [0, MAX_MONTHS_AHEAD]", () => {
    expect(projectForward(baseline(), defaultAssumptions(baseline()), "2026-09", 0)).toHaveLength(0);
    expect(projectForward(baseline(), defaultAssumptions(baseline()), "2026-09", -3)).toHaveLength(0);
    expect(
      projectForward(baseline(), defaultAssumptions(baseline()), "2026-09", 999),
    ).toHaveLength(MAX_MONTHS_AHEAD);
  });

  it("treats missing baseline pieces as zero rather than NaN", () => {
    const rows = projectForward(
      baseline({ activeNow: null, newSubsPerMonth: null, arpuCents: null, trialsPerMonth: null }),
      { monthlyGrowth: 0.2, churnRate: 0.1, conversionRate: 0.5 },
      "2026-09",
      1,
    );
    expect(rows[0].activeSubs).toBe(0);
    expect(rows[0].revenueCents).toBe(0);
    expect(Number.isNaN(rows[0].newSubs)).toBe(false);
  });
});

describe("defaultAssumptions", () => {
  it("seeds growth and conversion from the baseline, churn from the default", () => {
    const a = defaultAssumptions(baseline({ monthlyGrowth: 0.08, conversionRate: 0.42 }));
    expect(a.monthlyGrowth).toBe(0.08);
    expect(a.conversionRate).toBe(0.42);
    expect(a.churnRate).toBe(DEFAULT_CHURN_RATE);
  });

  it("falls back to the default conversion when the baseline has none", () => {
    const a = defaultAssumptions(baseline({ conversionRate: null }));
    expect(a.conversionRate).toBe(DEFAULT_CONVERSION_RATE);
  });
});
