import { describe, expect, it } from "vitest";
import {
  SEASONALITY_MIN_MONTHS,
  SEASONALITY_MIN_POINTS_PER_MONTH,
  bucketByMonth,
  computeSeasonality,
  formatSeasonality,
  fromMonthly,
  groupRuns,
  type RankPoint,
} from "./seasonality";
import { CATALOG } from "../../i18n/catalog";

// Fixed clock: 2026-09-08 UTC. The window is the 24 months ending September 2026.
const NOW = Date.UTC(2026, 8, 8);

// Synthetic two-year series: `perMonth` observations in every month from
// October 2024 through September 2026, ranked by `rankFor(monthOfYear)`.
function series(rankFor: (month: number) => number, perMonth = 4): RankPoint[] {
  const points: RankPoint[] = [];
  for (let serial = 2024 * 12 + 9; serial <= 2026 * 12 + 8; serial += 1) {
    const year = Math.floor(serial / 12);
    const month = serial % 12;
    for (let i = 0; i < perMonth; i += 1) {
      // Spread the points across the month (days 2..26) so bucketing is exercised.
      points.push({ at: Date.UTC(year, month, 2 + i * 6), rank: rankFor(month) });
    }
  }
  return points;
}

describe("computeSeasonality: Q4 peak", () => {
  // Rank 1,000 in Nov + Dec, 5,000 the rest of the year (lower rank = more demand).
  const q4 = series((m) => (m === 10 || m === 11 ? 1_000 : 5_000));

  it("finds the Nov-Dec peak with a wrap-safe run", () => {
    const s = computeSeasonality(q4, NOW);
    expect(s).not.toBeNull();
    expect(s!.label).toBe("peaks");
    expect(s!.peakMonths).toEqual([10, 11]);
    expect(s!.index).toHaveLength(12);
    // Typical months sit at 1.0; the peak months are clearly above the bar.
    expect(s!.index[5]).toBeCloseTo(1, 6);
    expect(s!.index[10]).toBeCloseTo(5, 6);
    expect(s!.index[11]).toBeCloseTo(5, 6);
    // 24 calendar months, every one with 4 points.
    expect(s!.monthsCovered).toBe(24);
  });

  it("formats as Peaks in Nov-Dec", () => {
    const s = computeSeasonality(q4, NOW)!;
    expect(formatSeasonality(s, CATALOG.en)).toBe("Peaks in Nov-Dec");
    expect(formatSeasonality(s, CATALOG.es)).toBe("Picos en Nov-Dic");
    expect(formatSeasonality(s, CATALOG.fr)).toBe("Pics en nov.-déc.");
  });
});

describe("computeSeasonality: flat demand", () => {
  it("labels a flat series steady with no peaks", () => {
    const s = computeSeasonality(series(() => 3_000), NOW);
    expect(s).not.toBeNull();
    expect(s!.label).toBe("steady");
    expect(s!.peakMonths).toEqual([]);
    for (const v of s!.index) expect(v).toBeCloseTo(1, 6);
    expect(formatSeasonality(s!, CATALOG.en)).toBe("Steady all year");
  });

  it("tolerates mild wobble below the steady ratio", () => {
    // +/- 8% around 3,000 stays under the 1.25 max/min bar.
    const s = computeSeasonality(series((m) => (m % 2 === 0 ? 3_240 : 2_760)), NOW);
    expect(s!.label).toBe("steady");
  });
});

describe("computeSeasonality: coverage floor", () => {
  it("returns null on sparse data (too few months)", () => {
    const sparse = series((m) => (m === 11 ? 500 : 5_000)).filter(
      (p) => new Date(p.at).getUTCFullYear() === 2026 && new Date(p.at).getUTCMonth() < SEASONALITY_MIN_MONTHS - 1,
    );
    expect(computeSeasonality(sparse, NOW)).toBeNull();
  });

  it("returns null when months exist but each is too thin", () => {
    const thin = series(() => 2_000, SEASONALITY_MIN_POINTS_PER_MONTH - 1);
    expect(computeSeasonality(thin, NOW)).toBeNull();
  });

  it("ignores points outside the 24-month window and in the future", () => {
    const old = series(() => 100).map((p) => ({ ...p, at: p.at - 3 * 365 * 86_400_000 }));
    const future = series(() => 100).map((p) => ({ ...p, at: p.at + 3 * 365 * 86_400_000 }));
    expect(computeSeasonality([...old, ...future], NOW)).toBeNull();
  });

  it("drops invalid ranks and timestamps", () => {
    const junk: RankPoint[] = [
      { at: NaN, rank: 100 },
      { at: NOW, rank: 0 },
      { at: NOW, rank: -5 },
      { at: NOW, rank: NaN },
    ];
    expect(computeSeasonality(junk, NOW)).toBeNull();
    expect(bucketByMonth(junk)).toEqual([]);
  });

  it("passes exactly at the floor", () => {
    // Exactly 10 calendar months (Dec 2025 .. Sep 2026) with exactly 3 points each.
    const points: RankPoint[] = [];
    for (let serial = 2025 * 12 + 11; serial <= 2026 * 12 + 8; serial += 1) {
      for (let i = 0; i < SEASONALITY_MIN_POINTS_PER_MONTH; i += 1) {
        points.push({ at: Date.UTC(Math.floor(serial / 12), serial % 12, 3 + i), rank: 4_000 });
      }
    }
    const s = computeSeasonality(points, NOW);
    expect(s).not.toBeNull();
    expect(s!.monthsCovered).toBe(SEASONALITY_MIN_MONTHS);
    expect(s!.label).toBe("steady");
  });
});

describe("Dec-Jan wrap grouping", () => {
  it("groups a December-January peak into one run starting in December", () => {
    const s = computeSeasonality(series((m) => (m === 11 || m === 0 ? 800 : 5_000)), NOW)!;
    expect(s.peakMonths).toEqual([11, 0]);
    expect(formatSeasonality(s, CATALOG.en)).toBe("Peaks in Dec-Jan");
  });

  it("keeps separate runs separate and lists them in calendar order", () => {
    const s = computeSeasonality(
      series((m) => (m === 11 || m === 0 || m === 1 || m === 6 ? 800 : 5_000)),
      NOW,
    )!;
    expect(groupRuns(s.peakMonths)).toEqual([[6], [11, 0, 1]]);
    expect(formatSeasonality(s, CATALOG.en)).toBe("Peaks in Jul, Dec-Feb");
  });

  it("groupRuns handles empty, single, and full-year inputs", () => {
    expect(groupRuns([])).toEqual([]);
    expect(groupRuns([4])).toEqual([[4]]);
    expect(groupRuns([3, 4, 5])).toEqual([[3, 4, 5]]);
    expect(groupRuns(Array.from({ length: 12 }, (_, i) => i))).toHaveLength(1);
    expect(groupRuns([13, -1, 2])).toEqual([[2]]);
  });
});

describe("fromMonthly parity with computeSeasonality", () => {
  it("yields the same result from pre-bucketed data", () => {
    const raw = series((m) => (m === 10 || m === 11 ? 1_000 : 5_000) + m * 7);
    const direct = computeSeasonality(raw, NOW);
    const viaBuckets = fromMonthly(bucketByMonth(raw), NOW);
    expect(viaBuckets).toEqual(direct);
  });

  it("merges duplicate month entries point-weighted", () => {
    const raw = series(() => 2_000);
    const buckets = bucketByMonth(raw);
    // Split every bucket in two halves: same math, same answer.
    const split = buckets.flatMap((b) => [
      { ...b, points: b.points / 2 },
      { ...b, points: b.points / 2 },
    ]);
    expect(fromMonthly(split, NOW)).toEqual(fromMonthly(buckets, NOW));
  });

  it("ignores malformed months and non-finite values", () => {
    const buckets = bucketByMonth(series(() => 2_000));
    const noisy = [
      ...buckets,
      { month: "not-a-month", logMeanRank: 1, points: 50 },
      { month: "2026-13", logMeanRank: 1, points: 50 },
      { month: "2026-05", logMeanRank: NaN, points: 50 },
    ];
    expect(fromMonthly(noisy, NOW)).toEqual(fromMonthly(buckets, NOW));
  });

  it("returns null below the month floor", () => {
    const buckets = bucketByMonth(series(() => 2_000)).slice(0, SEASONALITY_MIN_MONTHS - 1);
    expect(fromMonthly(buckets, NOW)).toBeNull();
  });
});

describe("formatSeasonality edge cases", () => {
  it("returns null when the series is variable but no month clears the peak bar", () => {
    // A single trough month (rank worse than typical) makes max/min >= 1.25 without
    // any month reaching a 1.35 index: nothing honest to put in a chip.
    const s = computeSeasonality(series((m) => (m === 3 ? 9_000 : 3_000)), NOW)!;
    expect(s.label).toBe("peaks");
    expect(s.peakMonths).toEqual([]);
    expect(formatSeasonality(s, CATALOG.en)).toBeNull();
  });
});
