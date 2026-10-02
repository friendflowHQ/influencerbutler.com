// GET /api/admin/finance/valuation
//
// Latest valuation snapshot plus recent history for the Finance dashboard's
// Valuation tab's trend bars. Snapshots are written weekly by
// /api/cron/valuation (a Claude Code routine), or on demand via
// /api/admin/finance/valuation/recompute.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinance } from "@/lib/finance-stepup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_WEEKS = 26;

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from("valuation_snapshots")
    .select(
      "snapshot_date,active_subscriptions,mrr_cents,arr_cents,monthly_growth_rate,multiple_low,multiple_base,multiple_high,valuation_low_cents,valuation_base_cents,valuation_high_cents,created_at",
    )
    .order("snapshot_date", { ascending: false })
    .limit(HISTORY_WEEKS);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") {
      return NextResponse.json({ migrationPending: true });
    }
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const history = (data ?? []).slice().reverse();
  const latest = history.length > 0 ? history[history.length - 1] : null;

  return NextResponse.json({ ok: true, latest, history });
}
