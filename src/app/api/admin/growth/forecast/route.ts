/**
 * GET /api/admin/growth/forecast
 *
 * Derives the default forecast baseline for future months from the last few
 * complete months of real data: recent run-rates for new subscriptions, trials,
 * and revenue, the current active-subscriber count, and the trend-derived
 * growth and trial-conversion rates. The client rolls this forward for any
 * future month and recomputes live as the assumption sliders move, so this
 * route is month-agnostic (it always forecasts from the current month).
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { currentMonthKey, type SnapshotClient } from "@/lib/growth-metrics";
import {
  computeForecastInputs,
  defaultAssumptions,
  MAX_MONTHS_AHEAD,
} from "@/lib/growth-forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as SnapshotClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const currentMonth = currentMonthKey(new Date());
  const baseline = await computeForecastInputs(supabase, currentMonth);

  return NextResponse.json({
    currentMonth,
    maxMonthsAhead: MAX_MONTHS_AHEAD,
    baseline,
    defaults: defaultAssumptions(baseline),
  });
}
