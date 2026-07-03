/**
 * GET /api/admin/growth/metrics?month=YYYY-MM
 *
 * One month of growth numbers (current vs previous month + daily series)
 * from our own tables: trial clicks, trials, subscriptions, revenue,
 * affiliate activity, testimonials, newsletter signups. Defaults to the
 * current UTC month. Each metric is best-effort; a failed query nulls the
 * metric instead of failing the page.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import {
  computeGrowthSnapshot,
  monthKey,
  GROWTH_METRICS,
  type SnapshotClient,
} from "@/lib/growth-metrics";

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

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? monthKey(new Date());

  const snapshot = await computeGrowthSnapshot(supabase, month);
  if (!snapshot) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  return NextResponse.json({
    admin: { email: actor.email },
    month: snapshot.month,
    prevMonth: snapshot.prevMonth,
    migrationPending: snapshot.migrationPending,
    catalog: GROWTH_METRICS,
    metrics: snapshot.metrics,
  });
}
