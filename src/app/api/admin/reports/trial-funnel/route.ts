/**
 * GET /api/admin/reports/trial-funnel?weeks=12
 *
 * Per-ISO-week (UTC, Monday start) trial funnel:
 *   - trialsStarted: subscriptions whose trial_started_at falls in the week
 *   - trialsConverted / conversionRate: cohort view - conversions counted in
 *     the week the trial STARTED, so the rate reads as "of trials started
 *     this week, how many became paid"
 *   - convertedThisWeek: event view - conversions stamped in the week
 *   - codesMinted: trial discount codes minted (bucketed by trial start)
 *   - codesRedeemed: orders whose discount_code exactly matches a minted
 *     trial code (exact matching so affiliate/branded codes never miscount);
 *     the code set includes trials up to 6 weeks before the window since a
 *     code minted in week 1 can redeem in week 4
 *
 * Depends on the 20260704_trial_conversion_capture migration; until it is
 * applied in prod the affected series are null and migrationPending: true.
 * supabase-js has no GROUP BY, so this fetches narrow row sets (trial volume
 * is low; 5000-row guards) and buckets in the route.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 26;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROW_LIMIT = 5000;

type RowsBuilder = {
  not: (col: string, op: string, value: null) => RowsBuilder;
  gte: (col: string, value: string) => RowsBuilder;
  limit: (n: number) => Promise<{
    data: Record<string, unknown>[] | null;
    error: { message?: string; code?: string } | null;
  }>;
};

type ReportClient = {
  from: (table: string) => {
    select: (cols: string) => RowsBuilder;
  };
};

/** Monday (UTC) of the week containing `iso`, as YYYY-MM-DD. */
function weekKey(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayFromMonday),
  );
  return monday.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as ReportClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const weeksRaw = Number.parseInt(url.searchParams.get("weeks") ?? "", 10);
  const weeks =
    Number.isFinite(weeksRaw) && weeksRaw >= 1 ? Math.min(weeksRaw, MAX_WEEKS) : DEFAULT_WEEKS;

  const now = Date.now();
  const windowStartIso = new Date(now - weeks * WEEK_MS).toISOString();
  // Codes minted before the window can still redeem inside it.
  const codeWindowStartIso = new Date(now - (weeks + 6) * WEEK_MS).toISOString();

  let migrationPending = false;

  // 1) Trials started in the window (with conversion + codes when available).
  type TrialRow = {
    trial_started_at?: string | null;
    trial_converted_at?: string | null;
    trial_discount_code_monthly?: string | null;
    trial_discount_code_annual?: string | null;
  };
  let trialRows: TrialRow[] = [];
  let haveConversion = true;
  {
    const full = await supabase
      .from("subscriptions")
      .select(
        "trial_started_at,trial_converted_at,trial_discount_code_monthly,trial_discount_code_annual",
      )
      .not("trial_started_at", "is", null)
      .gte("trial_started_at", windowStartIso)
      .limit(ROW_LIMIT);
    if (!full.error) {
      trialRows = (full.data ?? []) as TrialRow[];
    } else {
      // Likely 42703 on trial_converted_at: retry without it so starts/mints
      // still report while the migration is pending.
      haveConversion = false;
      migrationPending = true;
      const partial = await supabase
        .from("subscriptions")
        .select("trial_started_at,trial_discount_code_monthly,trial_discount_code_annual")
        .not("trial_started_at", "is", null)
        .gte("trial_started_at", windowStartIso)
        .limit(ROW_LIMIT);
      if (partial.error) {
        console.error("trial-funnel: trials query failed", partial.error);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
      }
      trialRows = (partial.data ?? []) as TrialRow[];
    }
  }

  // 2) Conversions by event week.
  const convertedByWeek = new Map<string, number>();
  if (haveConversion) {
    const res = await supabase
      .from("subscriptions")
      .select("trial_converted_at")
      .not("trial_converted_at", "is", null)
      .gte("trial_converted_at", windowStartIso)
      .limit(ROW_LIMIT);
    if (!res.error) {
      for (const row of (res.data ?? []) as { trial_converted_at?: string | null }[]) {
        if (!row.trial_converted_at) continue;
        const key = weekKey(row.trial_converted_at);
        if (key) convertedByWeek.set(key, (convertedByWeek.get(key) ?? 0) + 1);
      }
    }
  }

  // 3) The minted-trial-code set, extended back 6 weeks for late redemptions.
  const trialCodes = new Set<string>();
  {
    const res = await supabase
      .from("subscriptions")
      .select("trial_discount_code_monthly,trial_discount_code_annual")
      .not("trial_started_at", "is", null)
      .gte("trial_started_at", codeWindowStartIso)
      .limit(ROW_LIMIT);
    if (!res.error) {
      for (const row of (res.data ?? []) as TrialRow[]) {
        if (row.trial_discount_code_monthly) trialCodes.add(row.trial_discount_code_monthly);
        if (row.trial_discount_code_annual) trialCodes.add(row.trial_discount_code_annual);
      }
    }
  }

  // 4) Redemptions: orders with a captured discount_code matching a trial code.
  const redeemedByWeek = new Map<string, number>();
  let haveRedemptions = true;
  {
    const res = await supabase
      .from("orders")
      .select("discount_code,created_at")
      .not("discount_code", "is", null)
      .gte("created_at", windowStartIso)
      .limit(ROW_LIMIT);
    if (res.error) {
      haveRedemptions = false;
      migrationPending = true;
    } else {
      for (const row of (res.data ?? []) as { discount_code?: string | null; created_at?: string | null }[]) {
        if (!row.discount_code || !row.created_at) continue;
        if (!trialCodes.has(row.discount_code)) continue;
        const key = weekKey(row.created_at);
        if (key) redeemedByWeek.set(key, (redeemedByWeek.get(key) ?? 0) + 1);
      }
    }
  }

  // Bucket trials by start week (cohort view).
  const startedByWeek = new Map<string, number>();
  const cohortConvertedByWeek = new Map<string, number>();
  const mintedByWeek = new Map<string, number>();
  for (const row of trialRows) {
    if (!row.trial_started_at) continue;
    const key = weekKey(row.trial_started_at);
    if (!key) continue;
    startedByWeek.set(key, (startedByWeek.get(key) ?? 0) + 1);
    if (row.trial_converted_at) {
      cohortConvertedByWeek.set(key, (cohortConvertedByWeek.get(key) ?? 0) + 1);
    }
    const minted =
      (row.trial_discount_code_monthly ? 1 : 0) + (row.trial_discount_code_annual ? 1 : 0);
    if (minted > 0) mintedByWeek.set(key, (mintedByWeek.get(key) ?? 0) + minted);
  }

  // Emit a continuous week list (oldest first) so quiet weeks show as zeros.
  const series: {
    weekStart: string;
    trialsStarted: number;
    trialsConverted: number | null;
    conversionRate: number | null;
    convertedThisWeek: number | null;
    codesMinted: number;
    codesRedeemed: number | null;
  }[] = [];
  const currentWeekKey = weekKey(new Date(now).toISOString());
  for (let i = weeks; i >= 0; i--) {
    const key = weekKey(new Date(now - i * WEEK_MS).toISOString());
    if (!key) continue;
    if (series.some((w) => w.weekStart === key)) continue;
    const started = startedByWeek.get(key) ?? 0;
    const cohortConverted = haveConversion ? (cohortConvertedByWeek.get(key) ?? 0) : null;
    series.push({
      weekStart: key,
      trialsStarted: started,
      trialsConverted: cohortConverted,
      conversionRate:
        cohortConverted !== null && started > 0 ? cohortConverted / started : null,
      convertedThisWeek: haveConversion ? (convertedByWeek.get(key) ?? 0) : null,
      codesMinted: mintedByWeek.get(key) ?? 0,
      codesRedeemed: haveRedemptions ? (redeemedByWeek.get(key) ?? 0) : null,
    });
  }

  return NextResponse.json({
    admin: { email: actor.email },
    weeks: series,
    currentWeekStart: currentWeekKey,
    migrationPending,
  });
}
