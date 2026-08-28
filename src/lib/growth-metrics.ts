// Growth dashboard metrics engine.
//
// computeGrowthSnapshot() pulls one month of "our own" growth numbers
// (trial clicks, trials, subscriptions, revenue, affiliates, testimonials,
// newsletter signups) plus the previous month for deltas, and a per-day
// series for sparklines. Everything is best-effort per metric: a failed
// query nulls that metric instead of failing the snapshot, mirroring the
// admin overview route.
//
// supabase-js has no GROUP BY or SUM, so we fetch narrow timestamp rows
// (volumes are low; 10k guards) and bucket in code, same as the
// trial-funnel report.

import { computeMonthlyEarnings } from "@/lib/affiliate-commissions-data";

export type MetricUnit = "count" | "cents";

export type GrowthMetricDef = {
  key: string;
  label: string;
  /** Short, punchy label for goal cards. */
  goalLabel: string;
  unit: MetricUnit;
  /** Whether the auto-suggester proposes a monthly goal for it. */
  goalable: boolean;
};

export const GROWTH_METRICS: GrowthMetricDef[] = [
  { key: "trial_clicks", label: "Free-trial clicks", goalLabel: "trial clicks", unit: "count", goalable: true },
  { key: "trials_started", label: "Trials started", goalLabel: "trials started", unit: "count", goalable: true },
  { key: "trial_conversions", label: "Trial conversions", goalLabel: "trial conversions", unit: "count", goalable: true },
  { key: "download_leads", label: "Download leads", goalLabel: "download leads", unit: "count", goalable: true },
  { key: "new_subscriptions", label: "New subscriptions", goalLabel: "new subscriptions", unit: "count", goalable: true },
  { key: "active_subscriptions", label: "Active subscribers", goalLabel: "active subscribers", unit: "count", goalable: true },
  { key: "on_trial_subscriptions", label: "On trial right now", goalLabel: "trials in progress", unit: "count", goalable: false },
  { key: "revenue_cents", label: "Revenue", goalLabel: "revenue", unit: "cents", goalable: true },
  { key: "affiliate_signups", label: "Affiliate applications", goalLabel: "affiliate applications", unit: "count", goalable: true },
  { key: "affiliate_clicks", label: "Affiliate link clicks", goalLabel: "affiliate link clicks", unit: "count", goalable: true },
  { key: "commission_paid_cents", label: "Commissions via Lemon Squeezy", goalLabel: "commissions paid", unit: "cents", goalable: false },
  { key: "commission_owed_cents", label: "Commission top-ups owed", goalLabel: "commission owed", unit: "cents", goalable: false },
  { key: "testimonials", label: "New testimonials", goalLabel: "new testimonials", unit: "count", goalable: true },
  { key: "email_subscribers", label: "Newsletter signups", goalLabel: "newsletter signups", unit: "count", goalable: true },
];

export type MetricSnapshot = {
  current: number | null;
  previous: number | null;
  /** Per-day values for the requested month (index 0 = the 1st), or null. */
  series: number[] | null;
};

export type GrowthSnapshot = {
  month: string;
  prevMonth: string;
  migrationPending: boolean;
  metrics: Record<string, MetricSnapshot>;
};

// ---------------------------------------------------------------------------
// Pure date helpers (unit-tested)
// ---------------------------------------------------------------------------

/** 'YYYY-MM' (UTC) for a date. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before a 'YYYY-MM' key. */
export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return monthKey(d);
}

/** Parses 'YYYY-MM' into UTC start/next-month-start ISO strings, or null. */
export function monthBounds(month: string): { startIso: string; nextIso: string; days: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const days = Math.round((next.getTime() - start.getTime()) / 86400000);
  return { startIso: start.toISOString(), nextIso: next.toISOString(), days };
}

/** Month-over-month delta as a fraction (0.1 = +10%), or null when unknowable. */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

// ---------------------------------------------------------------------------
// Snapshot computation
// ---------------------------------------------------------------------------

const ROW_LIMIT = 10000;

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
};

type Chain = PromiseLike<QueryResult> & {
  eq: (col: string, value: unknown) => Chain;
  not: (col: string, op: string, value: unknown) => Chain;
  gte: (col: string, value: string) => Chain;
  lt: (col: string, value: string) => Chain;
  limit: (n: number) => Chain;
};

export type SnapshotClient = {
  from: (table: string) => { select: (cols: string) => Chain };
};

function emptySnapshotMetric(): MetricSnapshot {
  return { current: null, previous: null, series: null };
}

/**
 * Buckets timestamp rows into {previous, current, series} for the window
 * [prevStart, nextStart). `value` extracts the amount each row contributes
 * (1 for counts, cents for revenue).
 */
function bucketRows(
  rows: Record<string, unknown>[],
  tsCol: string,
  prevMonth: string,
  month: string,
  days: number,
  value: (row: Record<string, unknown>) => number,
): MetricSnapshot {
  let current = 0;
  let previous = 0;
  const series = new Array<number>(days).fill(0);
  for (const row of rows) {
    const ts = row[tsCol];
    if (typeof ts !== "string" || ts.length < 10) continue;
    const rowMonth = ts.slice(0, 7);
    const v = value(row);
    if (rowMonth === month) {
      current += v;
      const day = Number(ts.slice(8, 10));
      if (day >= 1 && day <= days) series[day - 1] += v;
    } else if (rowMonth === prevMonth) {
      previous += v;
    }
  }
  return { current, previous, series };
}

const one = () => 1;

/**
 * The full growth snapshot for a month. `month` is 'YYYY-MM' (UTC); pass the
 * current month for the live dashboard or an earlier one for history.
 */
export async function computeGrowthSnapshot(
  supabase: SnapshotClient,
  month: string,
): Promise<GrowthSnapshot | null> {
  const bounds = monthBounds(month);
  if (!bounds) return null;
  const prevMonth = prevMonthKey(month);
  const prevBounds = monthBounds(prevMonth);
  if (!prevBounds) return null;

  const metrics: Record<string, MetricSnapshot> = {};
  for (const def of GROWTH_METRICS) metrics[def.key] = emptySnapshotMetric();
  let migrationPending = false;

  /** Two-month window fetch; returns rows or null on error. */
  async function windowRows(
    table: string,
    cols: string,
    tsCol: string,
    extra?: (c: Chain) => Chain,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      let chain = supabase
        .from(table)
        .select(cols)
        .gte(tsCol, prevBounds!.startIso)
        .lt(tsCol, bounds!.nextIso);
      if (extra) chain = extra(chain);
      const res = await chain.limit(ROW_LIMIT);
      if (res.error) {
        console.error(`growth snapshot: ${table} query failed`, res.error);
        return null;
      }
      return res.data ?? [];
    } catch (err) {
      console.error(`growth snapshot: ${table} query threw`, err);
      return null;
    }
  }

  const addonVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? "";
  const isAddon = (row: Record<string, unknown>) =>
    addonVariant !== "" && String(row.ls_variant_id ?? "") === addonVariant;

  const [
    trialClickRows,
    trialStartRows,
    trialConvRows,
    newSubRows,
    activeRows,
    orderRows,
    affSignupRows,
    affClickRows,
    testimonialRows,
    emailSubRows,
    earnings,
  ] = await Promise.all([
    windowRows("activity_events", "created_at", "created_at", (c) =>
      c.eq("kind", "trial_click").eq("is_bot", false),
    ),
    windowRows("subscriptions", "trial_started_at", "trial_started_at", (c) =>
      c.not("trial_started_at", "is", null),
    ),
    windowRows("subscriptions", "trial_converted_at", "trial_converted_at", (c) =>
      c.not("trial_converted_at", "is", null),
    ),
    windowRows("subscriptions", "created_at,ls_variant_id", "created_at"),
    // Point-in-time: every active/on-trial sub, filtered for the addon
    // variant in code.
    (async () => {
      try {
        const res = await supabase
          .from("subscriptions")
          .select("status,ls_variant_id")
          .not("status", "in", '("cancelled","expired")')
          .limit(ROW_LIMIT);
        if (res.error) {
          console.error("growth snapshot: live subs query failed", res.error);
          return null;
        }
        return res.data ?? [];
      } catch (err) {
        console.error("growth snapshot: live subs query threw", err);
        return null;
      }
    })(),
    windowRows("orders", "created_at,total", "created_at", (c) => c.eq("status", "paid")),
    windowRows("affiliate_applications", "created_at", "created_at"),
    windowRows("affiliate_clicks", "created_at", "created_at", (c) => c.eq("is_bot", false)),
    windowRows("testimonials", "created_at", "created_at"),
    windowRows("email_subscribers", "created_at,source", "created_at"),
    (async () => {
      try {
        const [y, m] = month.split("-").map(Number);
        return await computeMonthlyEarnings({ months: 2, endYear: y, endMonth1: m });
      } catch (err) {
        console.error("growth snapshot: commission earnings failed", err);
        return null;
      }
    })(),
  ]);

  const bucket = (
    rows: Record<string, unknown>[] | null,
    tsCol: string,
    value: (row: Record<string, unknown>) => number = one,
  ) =>
    rows ? bucketRows(rows, tsCol, prevMonth, month, bounds.days, value) : emptySnapshotMetric();

  metrics.trial_clicks = bucket(trialClickRows, "created_at");
  metrics.trials_started = bucket(trialStartRows, "trial_started_at");
  if (trialConvRows) {
    metrics.trial_conversions = bucketRows(
      trialConvRows,
      "trial_converted_at",
      prevMonth,
      month,
      bounds.days,
      one,
    );
  } else {
    // Most likely 42703: trial_converted_at not in prod yet.
    migrationPending = true;
  }
  if (newSubRows) {
    metrics.new_subscriptions = bucketRows(
      newSubRows.filter((r) => !isAddon(r)),
      "created_at",
      prevMonth,
      month,
      bounds.days,
      one,
    );
  }
  if (activeRows) {
    const live = activeRows.filter((r) => !isAddon(r));
    metrics.active_subscriptions = {
      current: live.filter((r) => r.status === "active").length,
      previous: null,
      series: null,
    };
    metrics.on_trial_subscriptions = {
      current: live.filter((r) => r.status === "on_trial").length,
      previous: null,
      series: null,
    };
  }
  metrics.revenue_cents = bucket(orderRows, "created_at", (row) =>
    typeof row.total === "number" && Number.isFinite(row.total) ? row.total : 0,
  );
  metrics.affiliate_signups = bucket(affSignupRows, "created_at");
  metrics.affiliate_clicks = bucket(affClickRows, "created_at");
  metrics.testimonials = bucket(testimonialRows, "created_at");
  metrics.email_subscribers = bucket(emailSubRows, "created_at");
  // Download leads: the subset of email_subscribers captured at the gated app
  // download (source = 'download-app'). Broken out from the newsletter total so
  // the funnel's actual named-lead volume is visible on its own.
  metrics.download_leads = bucket(
    emailSubRows
      ? emailSubRows.filter((r) => String(r.source ?? "") === "download-app")
      : null,
    "created_at",
  );

  if (earnings && earnings.totals.length >= 1) {
    const cur = earnings.totals.find((b) => b.month === month) ?? null;
    const prev = earnings.totals.find((b) => b.month === prevMonth) ?? null;
    metrics.commission_paid_cents = {
      current: cur ? cur.lsPaidCents : null,
      previous: prev ? prev.lsPaidCents : null,
      series: null,
    };
    metrics.commission_owed_cents = {
      current: cur ? cur.owedCents : null,
      previous: prev ? prev.owedCents : null,
      series: null,
    };
  }

  return { month, prevMonth, migrationPending, metrics };
}
