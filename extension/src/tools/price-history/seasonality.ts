import type { Dict } from "../../i18n/catalog";

// Seasonality of demand, read off a product's sales-rank history: does it
// sell evenly all year, or does it spike in particular months (a Q4 gift, a
// summer pool toy)? Pure math over rank observations; the panel decides where
// the observations come from (desktop history, pooled monthly buckets, or the
// pooled trend) and never renders below the coverage floor.
//
// Method
//   1. Bucket observations by UTC calendar month (YYYY-MM) inside the window
//      (the last SEASONALITY_WINDOW_MONTHS months ending on the current month).
//   2. A calendar month counts only with >= SEASONALITY_MIN_POINTS_PER_MONTH
//      points; >= SEASONALITY_MIN_MONTHS such months are required, else null.
//   3. Per calendar month: mean of ln(rank). Fold the calendar months into the
//      12 months-of-year (point-weighted), so two Novembers merge.
//   4. Demand index per month-of-year = exp(overall median logRank - month
//      logMean): 1.0 is a typical month, higher = lower rank = more demand.
//      Months-of-year with no coverage are filled with 1.0 and ignored for the
//      label and the peaks.
//   5. peakMonths = months with index >= SEASONALITY_PEAK_INDEX, ordered as
//      consecutive runs with a Dec->Jan wrap ("Nov-Dec", "Dec-Jan").
//   6. label = "steady" when max/min < SEASONALITY_STEADY_RATIO, else "peaks".

export const SEASONALITY_MIN_MONTHS = 10;
export const SEASONALITY_MIN_POINTS_PER_MONTH = 3;
export const SEASONALITY_WINDOW_MONTHS = 24;
export const SEASONALITY_PEAK_INDEX = 1.35;
export const SEASONALITY_STEADY_RATIO = 1.25;

export type Seasonality = {
  // Distinct calendar months (YYYY-MM) that met the per-month point floor.
  monthsCovered: number;
  // 12 demand indices, January first. 1.0 = typical month (or no coverage).
  index: number[];
  // Month-of-year indices (0 = January) with index >= SEASONALITY_PEAK_INDEX,
  // ordered as consecutive runs so a Dec->Jan run reads [11, 0].
  peakMonths: number[];
  label: "steady" | "peaks";
};

export type RankPoint = { at: number; rank: number };

// One pre-bucketed calendar month, the shape the market RPC returns.
export type MonthlyBucket = { month: string; logMeanRank: number; points: number };

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function computeSeasonality(points: RankPoint[], now: number): Seasonality | null {
  const buckets = bucketByMonth(points);
  return fromMonthly(buckets, now);
}

// Same rules applied to pre-bucketed data (the server does the bucketing over
// the pooled history). computeSeasonality is exactly bucketByMonth + this, so
// the two paths agree on every threshold.
export function fromMonthly(buckets: MonthlyBucket[], now: number): Seasonality | null {
  if (!Number.isFinite(now)) return null;
  const nowDate = new Date(now);
  const nowSerial = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth();
  const oldestSerial = nowSerial - (SEASONALITY_WINDOW_MONTHS - 1);

  // Merge duplicate calendar months (a caller may hand us two partial lists)
  // point-weighted, then keep only the months inside the window with enough
  // points to be trusted.
  const merged = new Map<number, { logSum: number; points: number }>();
  for (const b of buckets) {
    const m = MONTH_RE.exec(b.month);
    if (!m) continue;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11) continue;
    if (!Number.isFinite(b.logMeanRank) || !Number.isFinite(b.points) || b.points <= 0) continue;
    const serial = year * 12 + month;
    if (serial < oldestSerial || serial > nowSerial) continue;
    const prev = merged.get(serial) ?? { logSum: 0, points: 0 };
    prev.logSum += b.logMeanRank * b.points;
    prev.points += b.points;
    merged.set(serial, prev);
  }

  const qualifying: Array<{ serial: number; logMean: number; points: number }> = [];
  for (const [serial, agg] of merged) {
    if (agg.points < SEASONALITY_MIN_POINTS_PER_MONTH) continue;
    qualifying.push({ serial, logMean: agg.logSum / agg.points, points: agg.points });
  }
  if (qualifying.length < SEASONALITY_MIN_MONTHS) return null;

  const overall = median(qualifying.map((q) => q.logMean));

  // Fold calendar months into months-of-year, point-weighted.
  const moy = Array.from({ length: 12 }, () => ({ logSum: 0, points: 0 }));
  for (const q of qualifying) {
    const slot = moy[((q.serial % 12) + 12) % 12]!;
    slot.logSum += q.logMean * q.points;
    slot.points += q.points;
  }

  const index: number[] = [];
  const covered: number[] = [];
  for (let m = 0; m < 12; m += 1) {
    const slot = moy[m]!;
    if (slot.points <= 0) {
      index.push(1);
      continue;
    }
    const value = Math.exp(overall - slot.logSum / slot.points);
    index.push(Number.isFinite(value) ? value : 1);
    covered.push(m);
  }

  const coveredValues = covered.map((m) => index[m]!);
  const max = Math.max(...coveredValues);
  const min = Math.min(...coveredValues);
  const label: Seasonality["label"] = min > 0 && max / min < SEASONALITY_STEADY_RATIO ? "steady" : "peaks";

  const peaks = covered.filter((m) => index[m]! >= SEASONALITY_PEAK_INDEX);
  const peakMonths = groupRuns(peaks).flat();

  return { monthsCovered: qualifying.length, index, peakMonths, label };
}

// Bucket raw observations into UTC calendar months. Exported for tests and so
// the panel can bucket desktop history with the same code path the server
// mirrors in SQL (date_trunc('month'), avg(ln(rank)), count(*)).
export function bucketByMonth(points: RankPoint[]): MonthlyBucket[] {
  const acc = new Map<string, { logSum: number; points: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.at) || !Number.isFinite(p.rank) || p.rank <= 0) continue;
    const d = new Date(p.at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const prev = acc.get(key) ?? { logSum: 0, points: 0 };
    prev.logSum += Math.log(p.rank);
    prev.points += 1;
    acc.set(key, prev);
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, agg]) => ({ month, logMeanRank: agg.logSum / agg.points, points: agg.points }));
}

// Group month-of-year indices into consecutive runs, wrapping Dec->Jan: a run
// that ends in December and another that starts in January become one run
// that starts in December. Every month peaking collapses to a single run
// starting in January.
export function groupRuns(months: number[]): number[][] {
  const set = new Set(months.filter((m) => Number.isInteger(m) && m >= 0 && m < 12));
  if (set.size === 0) return [];
  if (set.size === 12) return [Array.from({ length: 12 }, (_, i) => i)];

  // Start scanning from a month whose predecessor is NOT a peak so a wrapped
  // run is never split at the January boundary.
  let start = 0;
  while (set.has(((start - 1) % 12 + 12) % 12) && start < 12) start += 1;

  const runs: number[][] = [];
  let current: number[] = [];
  for (let step = 0; step < 12; step += 1) {
    const m = (start + step) % 12;
    if (set.has(m)) {
      current.push(m);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  // Present runs in calendar order by their first month, except a wrapped run
  // (which starts late in the year) keeps its natural start.
  return runs.sort((a, b) => a[0]! - b[0]!);
}

// "Peaks in Nov-Dec" / "Steady all year". Returns null when the series is
// variable but no month clears the peak bar (nothing honest to say in a chip).
export function formatSeasonality(s: Seasonality, t: Dict): string | null {
  if (s.label === "steady") return t.seasonSteady;
  if (s.peakMonths.length === 0) return null;
  const runs = groupRuns(s.peakMonths);
  const names = t.monthAbbr;
  const label = (m: number): string => names[m] ?? String(m + 1);
  const parts = runs.map((run) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    return run.length === 1 ? label(first) : `${label(first)}-${label(last)}`;
  });
  return t.seasonPeaks(parts.join(", "));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
