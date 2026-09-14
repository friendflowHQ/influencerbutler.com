import { describe, expect, it } from "vitest";
import {
  classifyRankTrend,
  coveredBars,
  formatCompactUnits,
  monthlyUnits,
  ninetyDayAvg,
  peakBar,
} from "./sales-histogram";
import type { MonthlyBucket } from "./seasonality";

const DAY = 24 * 60 * 60 * 1000;

// A fixed "now" so the trailing-12-month window is deterministic: Nov 2025.
const NOW = Date.UTC(2025, 10, 15);

function bucket(month: string, rank: number, points = 5): MonthlyBucket {
  return { month, logMeanRank: Math.log(rank), points };
}

describe("monthlyUnits", () => {
  it("returns 12 bars for the trailing year, oldest first, aligned to calendar months", () => {
    const bars = monthlyUnits([bucket("2025-11", 100)], NOW);
    expect(bars).toHaveLength(12);
    expect(bars[0]!.month).toBe("2024-12");
    expect(bars[11]!.month).toBe("2025-11");
    expect(bars[11]!.monthIndex).toBe(10); // November
    expect(bars[11]!.units).toBeGreaterThan(0);
  });

  it("marks months with no coverage as null and ignores buckets outside the window", () => {
    const bars = monthlyUnits([bucket("2025-11", 100), bucket("2024-01", 50)], NOW);
    const covered = bars.filter((b) => b.units != null);
    expect(covered).toHaveLength(1); // 2024-01 is before the trailing 12 months
    expect(bars[0]!.units).toBeNull();
  });

  it("gives a better (lower) rank month more units", () => {
    const bars = monthlyUnits([bucket("2025-11", 100), bucket("2025-07", 5000)], NOW);
    const nov = bars.find((b) => b.month === "2025-11")!;
    const jul = bars.find((b) => b.month === "2025-07")!;
    expect(nov.units!).toBeGreaterThan(jul.units!);
  });
});

describe("peakBar and coveredBars", () => {
  it("peakBar picks the highest-units month", () => {
    const bars = monthlyUnits([bucket("2025-11", 100), bucket("2025-07", 5000)], NOW);
    expect(peakBar(bars)!.month).toBe("2025-11");
  });

  it("coveredBars counts the months that carry data", () => {
    const bars = monthlyUnits(
      [bucket("2025-11", 100), bucket("2025-10", 200), bucket("2025-09", 300)],
      NOW,
    );
    expect(coveredBars(bars)).toBe(3);
  });

  it("peakBar is null when nothing has coverage", () => {
    expect(peakBar(monthlyUnits([], NOW))).toBeNull();
  });
});

describe("ninetyDayAvg", () => {
  it("averages only points inside the trailing 90 days", () => {
    const samples = [
      { at: NOW - 200 * DAY, value: 1000 }, // outside the window
      { at: NOW - 10 * DAY, value: 8000 },
      { at: NOW - 5 * DAY, value: 12000 },
    ];
    expect(ninetyDayAvg(samples, NOW)).toBe(10000);
  });

  it("is null when no point falls in the window", () => {
    expect(ninetyDayAvg([{ at: NOW - 120 * DAY, value: 500 }], NOW)).toBeNull();
    expect(ninetyDayAvg([], NOW)).toBeNull();
  });
});

describe("classifyRankTrend", () => {
  it("reads a lower current rank than the average as rising", () => {
    expect(classifyRankTrend(8000, 10000, 0.1)).toBe("rising");
  });

  it("reads a higher current rank as slipping", () => {
    expect(classifyRankTrend(12000, 10000, 0.1)).toBe("slipping");
  });

  it("stays steady inside the deadband", () => {
    expect(classifyRankTrend(10500, 10000, 0.1)).toBe("steady");
  });
});

describe("formatCompactUnits", () => {
  it("formats thousands compactly", () => {
    expect(formatCompactUnits(1000)).toBe("1K");
    expect(formatCompactUnits(1200)).toBe("1.2K");
    expect(formatCompactUnits(12000)).toBe("12K");
  });

  it("rounds hundreds to the nearest ten and keeps small counts", () => {
    expect(formatCompactUnits(253)).toBe("250");
    expect(formatCompactUnits(7)).toBe("7");
  });
});
