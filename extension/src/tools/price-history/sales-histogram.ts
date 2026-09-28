import { estimateMonthlyUnits } from "../../amazon/bsr-revenue-estimator";
import type { MonthlyBucket } from "./seasonality";

// A 12-month sales-volume histogram, derived from the same pooled monthly rank
// buckets that feed the seasonality chip. Each month's mean sales rank is turned
// into estimated units with the shared BSR->units model, so the bars agree with
// the "Est. units/mo" figure shown above them. Pure and DOM-free (node-testable);
// the panel owns the SVG.

// One bar: a calendar month in the trailing-12 window, with modeled units or
// null when that month has no pooled coverage (drawn as an empty slot).
export type UnitsBar = { month: string; monthIndex: number; units: number | null };

const MONTH_RE = /^(\d{4})-(\d{2})$/;

// The trailing 12 calendar months (oldest first), each with modeled units from
// the point-weighted mean rank of that month's pooled observations. Months with
// no coverage inside the window come back as units:null.
export function monthlyUnits(
  buckets: MonthlyBucket[],
  now: number,
  opts: { category?: string | null } = {},
): UnitsBar[] {
  const nowDate = new Date(now);
  const nowSerial = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth();
  const oldestSerial = nowSerial - 11;

  // Merge duplicate calendar months point-weighted (a caller may hand two
  // partial lists), keeping only months inside the trailing-12 window.
  const merged = new Map<number, { logSum: number; points: number }>();
  for (const b of buckets) {
    const m = MONTH_RE.exec(b.month);
    if (!m) continue;
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11) continue;
    if (!Number.isFinite(b.logMeanRank) || !Number.isFinite(b.points) || b.points <= 0) continue;
    const serial = Number(m[1]) * 12 + month;
    if (serial < oldestSerial || serial > nowSerial) continue;
    const prev = merged.get(serial) ?? { logSum: 0, points: 0 };
    prev.logSum += b.logMeanRank * b.points;
    prev.points += b.points;
    merged.set(serial, prev);
  }

  const bars: UnitsBar[] = [];
  for (let serial = oldestSerial; serial <= nowSerial; serial += 1) {
    const year = Math.floor(serial / 12);
    const monthIndex = ((serial % 12) + 12) % 12;
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const agg = merged.get(serial);
    let units: number | null = null;
    if (agg && agg.points > 0) {
      const rank = Math.exp(agg.logSum / agg.points);
      units = estimateMonthlyUnits({ salesRank: rank, category: opts.category ?? null });
    }
    bars.push({ month: key, monthIndex, units });
  }
  return bars;
}

// The month with the most modeled units, for the "Peaked ~1K in Nov" callout.
// null when no bar has coverage.
export function peakBar(bars: UnitsBar[]): UnitsBar | null {
  let best: UnitsBar | null = null;
  for (const bar of bars) {
    if (bar.units == null) continue;
    if (!best || (best.units ?? 0) < bar.units) best = bar;
  }
  return best;
}

// How many bars in the window actually carry data. The panel uses this to hide
// the histogram for a stale series (mostly-empty recent months would mislead).
export function coveredBars(bars: UnitsBar[]): number {
  return bars.reduce((n, bar) => (bar.units != null ? n + 1 : n), 0);
}

// One dated rank observation, the shape the panel already carries for the BSR
// sparkline (epoch ms + rank value).
export type RankSample = { at: number; value: number };

// Mean sales rank over the trailing 90 days of the series; null when no point
// falls in that window. Rounded, since it is shown as a rank.
export function ninetyDayAvg(samples: RankSample[], now: number): number | null {
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  const recent = samples.filter((s) => Number.isFinite(s.at) && s.at >= cutoff);
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, s) => acc + s.value, 0);
  return Math.round(sum / recent.length);
}

export type RankTrend = "steady" | "rising" | "slipping";

// Current rank vs its 90-day average. Lower rank is better, so a current below
// the average reads as "rising"; within `deadband` (a fraction) reads "steady".
export function classifyRankTrend(current: number, avg90: number, deadband: number): RankTrend {
  const delta = (current - avg90) / (avg90 || 1);
  if (delta <= -deadband) return "rising";
  if (delta >= deadband) return "slipping";
  return "steady";
}

// Compact units for the peak callout: "1K", "1.2K", "12K", or a rounded count
// under a thousand. Deliberately coarse so the "~" reads as an estimate.
export function formatCompactUnits(units: number): string {
  if (units >= 1000) {
    const k = units / 1000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${rounded}K`;
  }
  if (units >= 100) return `${Math.round(units / 10) * 10}`;
  return `${Math.max(1, Math.round(units))}`;
}
