// Growth dashboard forecast engine.
//
// The live dashboard shows secured numbers for the current month and history
// for past months. This module fills the gap on the other side of "now":
// projecting future months from recent trend. It has two halves:
//
//   1. Pure math (deriveMonthlyGrowth, recentAverage, deriveConversionRate,
//      projectForward) that turns a baseline + a set of assumptions into a
//      month-by-month projection. These are unit-tested and shared with the
//      client so the assumption sliders recompute instantly without a refetch.
//   2. computeForecastInputs(), which reads a few months of real history via
//      the admin Supabase client and derives the default baseline + trend
//      assumptions the sliders start from.
//
// The forecast is deliberately simple and honest: new subscriptions and trials
// grow at a derived monthly rate, active subscribers roll forward net of churn,
// and monthly revenue is modelled as active subscribers times average revenue
// per subscriber (an MRR-style figure, not the lumpy per-month order total).
// Every assumption is surfaced and adjustable, so nobody mistakes it for a
// promise.

// Type-only import: erased at build time, so pulling this module into a client
// component never drags the server-only bits of growth-metrics into the bundle.
import type { SnapshotClient } from "@/lib/growth-metrics";

/** How many complete months of history we read to derive the trend. */
const HISTORY_MONTHS = 6;
/** Hard ceiling on how far ahead the dashboard will project. */
export const MAX_MONTHS_AHEAD = 12;
/** Default monthly churn when we cannot derive it: an editable assumption. */
export const DEFAULT_CHURN_RATE = 0.05;
/** Default trial->paid conversion when history is missing (e.g. migration). */
export const DEFAULT_CONVERSION_RATE = 0.3;
/** Clamp derived growth to +/-50%/mo so one noisy month cannot run away. */
const GROWTH_CLAMP = 0.5;

const ROW_LIMIT = 10000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** One complete historical month used to derive the trend. */
export type ForecastHistoryPoint = {
  month: string;
  newSubs: number | null;
  revenueCents: number | null;
  trialsStarted: number | null;
  trialConversions: number | null;
};

/**
 * The derived starting point for a projection: current standing plus recent
 * run-rates and the trend derived from history. Everything the client needs to
 * project any future month for any set of assumptions.
 */
export type ForecastBaseline = {
  /** Active subscriber count right now (point-in-time). */
  activeNow: number | null;
  /** Recent monthly new-subscription run-rate. */
  newSubsPerMonth: number | null;
  /** Recent monthly revenue run-rate, in cents. */
  revenueCentsPerMonth: number | null;
  /** Average monthly revenue per active subscriber, in cents. */
  arpuCents: number | null;
  /** Recent monthly trials-started run-rate. */
  trialsPerMonth: number | null;
  /** Derived trial->paid conversion rate [0..1], or null when unknown. */
  conversionRate: number | null;
  /** Derived month-over-month growth for new subs & trials (fraction). */
  monthlyGrowth: number;
  /** True when trial_converted_at is not in prod yet (conversions unknown). */
  migrationPending: boolean;
  /** Completed months the trend was derived from, oldest first. */
  history: ForecastHistoryPoint[];
};

/** The three knobs a user can turn; each recomputes the projection live. */
export type ForecastAssumptions = {
  /** Month-over-month growth of new subs & trials (fraction, e.g. 0.1). */
  monthlyGrowth: number;
  /** Fraction of active subscribers lost each month. */
  churnRate: number;
  /** Fraction of trials that convert to paid. */
  conversionRate: number;
};

/** One projected future month. */
export type ForecastMonthProjection = {
  month: string;
  /** 1 = the month right after the current one. */
  monthsAhead: number;
  newSubs: number;
  activeSubs: number;
  trials: number;
  conversions: number;
  /** Modelled monthly revenue (active subs x ARPU), in cents. */
  revenueCents: number;
  /** Sum of modelled revenue from next month through this one, in cents. */
  cumulativeRevenueCents: number;
};

// ---------------------------------------------------------------------------
// Pure date helpers
// ---------------------------------------------------------------------------

/** 'YYYY-MM' shifted by whole months (UTC), delta may be negative. */
export function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Pure trend derivation (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Compound month-over-month growth across a series (oldest first), as a
 * fraction (0.1 = +10%/mo). Uses the first and last positive points as a CAGR
 * so a single zero/missing month in the middle does not blow it up, and clamps
 * the result to +/-50%/mo. Returns null when there are fewer than two positive
 * points to compare, so the caller can fall back to another series.
 */
export function deriveMonthlyGrowth(series: (number | null)[]): number | null {
  const vals = series.filter((v): v is number => typeof v === "number" && v > 0);
  if (vals.length < 2) return null;
  const first = vals[0];
  const last = vals[vals.length - 1];
  const steps = vals.length - 1;
  const g = Math.pow(last / first, 1 / steps) - 1;
  if (!Number.isFinite(g)) return null;
  return clamp(g, -GROWTH_CLAMP, GROWTH_CLAMP);
}

/**
 * Average of the last `n` non-null values in a series (oldest first). Used for
 * run-rates, where a short trailing average is steadier than the single last
 * month. Returns null when the series has no numbers at all.
 */
export function recentAverage(series: (number | null)[], n = 3): number | null {
  const vals = series.filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const tail = vals.slice(-n);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

/**
 * Blended trial->paid conversion over the history window: total conversions
 * divided by total trials started (pooled, so busy months weigh more). Returns
 * null when there are no comparable months or no trials at all.
 */
export function deriveConversionRate(history: ForecastHistoryPoint[]): number | null {
  let trials = 0;
  let conversions = 0;
  let seen = false;
  for (const h of history) {
    if (typeof h.trialsStarted === "number" && typeof h.trialConversions === "number") {
      trials += h.trialsStarted;
      conversions += h.trialConversions;
      seen = true;
    }
  }
  if (!seen || trials <= 0) return null;
  return clamp(conversions / trials, 0, 1);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Roll the baseline forward `monthsAhead` months under the given assumptions.
 * Returns one entry per month (index 0 = next month). New subs and trials grow
 * geometrically at `monthlyGrowth`; active subscribers carry forward net of
 * churn plus that month's new subs; revenue is active subs x ARPU.
 */
export function projectForward(
  baseline: ForecastBaseline,
  assumptions: ForecastAssumptions,
  currentMonth: string,
  monthsAhead: number,
): ForecastMonthProjection[] {
  const out: ForecastMonthProjection[] = [];
  const months = Math.max(0, Math.min(MAX_MONTHS_AHEAD, Math.floor(monthsAhead)));
  const g = assumptions.monthlyGrowth;
  const churn = clamp(assumptions.churnRate, 0, 1);
  const conv = clamp(assumptions.conversionRate, 0, 1);
  const baseNewSubs = baseline.newSubsPerMonth ?? 0;
  const baseTrials = baseline.trialsPerMonth ?? 0;
  const arpu = baseline.arpuCents ?? 0;

  let active = baseline.activeNow ?? 0;
  let cumulative = 0;
  for (let k = 1; k <= months; k++) {
    const factor = Math.pow(1 + g, k);
    const newSubs = baseNewSubs * factor;
    const trials = baseTrials * factor;
    const conversions = trials * conv;
    active = active * (1 - churn) + newSubs;
    const revenueCents = active * arpu;
    cumulative += revenueCents;
    out.push({
      month: addMonthKey(currentMonth, k),
      monthsAhead: k,
      newSubs,
      activeSubs: active,
      trials,
      conversions,
      revenueCents,
      cumulativeRevenueCents: cumulative,
    });
  }
  return out;
}

/** The trend-derived defaults the assumption sliders start from. */
export function defaultAssumptions(baseline: ForecastBaseline): ForecastAssumptions {
  return {
    monthlyGrowth: baseline.monthlyGrowth,
    churnRate: DEFAULT_CHURN_RATE,
    conversionRate: baseline.conversionRate ?? DEFAULT_CONVERSION_RATE,
  };
}

// ---------------------------------------------------------------------------
// Server: derive the baseline from real history
// ---------------------------------------------------------------------------

type BucketMap = Map<string, number>;

/** Sums `value(row)` per 'YYYY-MM' bucket of `tsCol`, over the given months. */
function bucketByMonth(
  rows: Record<string, unknown>[] | null,
  tsCol: string,
  months: string[],
  value: (row: Record<string, unknown>) => number,
): BucketMap | null {
  if (!rows) return null;
  const map: BucketMap = new Map(months.map((m) => [m, 0]));
  for (const row of rows) {
    const ts = row[tsCol];
    if (typeof ts !== "string" || ts.length < 7) continue;
    const key = ts.slice(0, 7);
    if (map.has(key)) map.set(key, map.get(key)! + value(row));
  }
  return map;
}

/** Turns a bucket map into a value-per-month array aligned to `months`. */
function seriesFor(map: BucketMap | null, months: string[]): (number | null)[] {
  if (!map) return months.map(() => null);
  return months.map((m) => map.get(m) ?? 0);
}

/**
 * Reads the last {@link HISTORY_MONTHS} complete months of real data (the
 * current partial month is excluded so run-rates are not dragged down by a
 * month in progress) and derives the default forecast baseline.
 */
export async function computeForecastInputs(
  supabase: SnapshotClient,
  currentMonth: string,
): Promise<ForecastBaseline> {
  // Complete months only: [current - HISTORY_MONTHS, current), oldest first.
  const months: string[] = [];
  for (let i = HISTORY_MONTHS; i >= 1; i--) months.push(addMonthKey(currentMonth, -i));
  const windowStart = new Date(`${months[0]}-01T00:00:00.000Z`).toISOString();
  const windowEnd = new Date(`${currentMonth}-01T00:00:00.000Z`).toISOString();

  const addonVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? "";
  const isAddon = (row: Record<string, unknown>) =>
    addonVariant !== "" && String(row.ls_variant_id ?? "") === addonVariant;

  // Best-effort per query: a failure nulls that one series, mirroring the
  // snapshot engine, so the forecast degrades rather than erroring.
  async function windowRows(
    table: string,
    cols: string,
    tsCol: string,
    extra?: (c: ReturnType<ReturnType<SnapshotClient["from"]>["select"]>) => ReturnType<ReturnType<SnapshotClient["from"]>["select"]>,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      let chain = supabase.from(table).select(cols).gte(tsCol, windowStart).lt(tsCol, windowEnd);
      if (extra) chain = extra(chain);
      const res = await chain.limit(ROW_LIMIT);
      if (res.error) {
        console.error(`growth forecast: ${table} query failed`, res.error);
        return null;
      }
      return res.data ?? [];
    } catch (err) {
      console.error(`growth forecast: ${table} query threw`, err);
      return null;
    }
  }

  const [newSubRows, orderRows, trialStartRows, trialConvRows, activeRows] = await Promise.all([
    windowRows("subscriptions", "created_at,ls_variant_id", "created_at"),
    windowRows("orders", "created_at,total", "created_at", (c) => c.eq("status", "paid")),
    windowRows("subscriptions", "trial_started_at", "trial_started_at", (c) =>
      c.not("trial_started_at", "is", null),
    ),
    windowRows("subscriptions", "trial_converted_at", "trial_converted_at", (c) =>
      c.not("trial_converted_at", "is", null),
    ),
    (async () => {
      try {
        const res = await supabase
          .from("subscriptions")
          .select("status,ls_variant_id")
          .not("status", "in", '("cancelled","expired")')
          .limit(ROW_LIMIT);
        if (res.error) {
          console.error("growth forecast: live subs query failed", res.error);
          return null;
        }
        return res.data ?? [];
      } catch (err) {
        console.error("growth forecast: live subs query threw", err);
        return null;
      }
    })(),
  ]);

  const newSubSeries = seriesFor(
    bucketByMonth(newSubRows ? newSubRows.filter((r) => !isAddon(r)) : null, "created_at", months, () => 1),
    months,
  );
  const revenueSeries = seriesFor(
    bucketByMonth(orderRows, "created_at", months, (row) =>
      typeof row.total === "number" && Number.isFinite(row.total) ? row.total : 0,
    ),
    months,
  );
  const trialSeries = seriesFor(
    bucketByMonth(trialStartRows, "trial_started_at", months, () => 1),
    months,
  );
  // A null result here most likely means trial_converted_at is not in prod yet.
  const migrationPending = trialConvRows === null;
  const convSeries = seriesFor(
    bucketByMonth(trialConvRows, "trial_converted_at", months, () => 1),
    months,
  );

  const history: ForecastHistoryPoint[] = months.map((m, i) => ({
    month: m,
    newSubs: newSubRows ? newSubSeries[i] : null,
    revenueCents: orderRows ? revenueSeries[i] : null,
    trialsStarted: trialStartRows ? trialSeries[i] : null,
    trialConversions: migrationPending ? null : convSeries[i],
  }));

  const activeNow = activeRows
    ? activeRows.filter((r) => r.status === "active" && !isAddon(r)).length
    : null;
  const newSubsPerMonth = newSubRows ? recentAverage(newSubSeries) : null;
  const revenueCentsPerMonth = orderRows ? recentAverage(revenueSeries) : null;
  const trialsPerMonth = trialStartRows ? recentAverage(trialSeries) : null;
  const arpuCents =
    activeNow && activeNow > 0 && revenueCentsPerMonth !== null
      ? Math.round(revenueCentsPerMonth / activeNow)
      : null;

  // Growth is driven off new subs, the clearest leading signal; if that has too
  // little history, fall back to the revenue trend, then to flat.
  const monthlyGrowth =
    deriveMonthlyGrowth(newSubSeries) ?? deriveMonthlyGrowth(revenueSeries) ?? 0;
  const conversionRate = deriveConversionRate(history);

  return {
    activeNow,
    newSubsPerMonth,
    revenueCentsPerMonth,
    arpuCents,
    trialsPerMonth,
    conversionRate,
    monthlyGrowth,
    migrationPending,
    history,
  };
}
