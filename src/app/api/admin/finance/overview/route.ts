// GET /api/admin/finance/overview
//
// Everything the Finance Overview tab shows in one call: revenue recognition
// buckets, the LS payout forecast, and the next quarterly tax deadline with
// its recommended set-aside.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinance } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { computeRevenueBuckets } from "@/lib/finance-revenue";
import { computePayoutForecast, type RecordedPayout } from "@/lib/finance-ls-payouts";
import { nextDeadline, daysUntil, computeTaxSetAside, MOR_EDUCATION } from "@/lib/finance-tax";
import { buildPnl } from "@/lib/finance-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return ordersResult.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const { data: payoutRows, error: payoutError } = await db
    .from("finance_payouts")
    .select("id,amount_cents,paid_at,note")
    .order("paid_at", { ascending: false });
  if (payoutError) {
    return NextResponse.json({ migrationPending: true });
  }
  const recorded: RecordedPayout[] = (payoutRows ?? []).map((p) => ({
    id: p.id as string,
    amountCents: (p.amount_cents as number) ?? 0,
    paidAt: ((p.paid_at as string) ?? "").slice(0, 10),
    note: (p.note as string | null) ?? null,
  }));

  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const buckets = computeRevenueBuckets(ordersResult.orders, settings, nowMs);
  const forecast = computePayoutForecast(ordersResult.orders, recorded, settings, nowMs);

  // Current-quarter net profit -> set-aside for the deadline banner.
  const { quarter } = nextDeadline(today);
  const pnl = await buildPnl(db, ordersResult.orders, quarter.periodStart, quarter.periodEnd, settings);
  const netProfitCents = "migrationPending" in pnl ? 0 : pnl.netProfitCents;

  return NextResponse.json({
    ok: true,
    verifiedUntil: gate.verifiedUntil,
    settings,
    buckets,
    forecast,
    enrichment: {
      enrichedCount: ordersResult.enrichedCount,
      totalOrders: ordersResult.orders.length,
    },
    tax: {
      nextDeadline: quarter,
      daysUntilDeadline: daysUntil(today, quarter.dueDate),
      quarterNetProfitCents: netProfitCents,
      setAside: computeTaxSetAside(netProfitCents, settings),
      morEducation: MOR_EDUCATION,
      taxMode: settings.taxMode,
    },
  });
}
