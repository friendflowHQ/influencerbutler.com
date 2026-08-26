// GET /api/admin/finance/revenue?granularity=day|week|month
//
// Revenue recognition buckets + a time series for the Revenue tab. The series
// window scales with granularity: 30 days, 26 weeks, or 12 months.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinance } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import {
  buildRevenueSeries,
  computeRevenueBuckets,
  type RevenueGranularity,
} from "@/lib/finance-revenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const raw = url.searchParams.get("granularity");
  const granularity: RevenueGranularity =
    raw === "week" || raw === "month" ? raw : "day";

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return ordersResult.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const nowMs = Date.now();
  const windowMs =
    granularity === "month" ? 365 * DAY_MS : granularity === "week" ? 26 * 7 * DAY_MS : 30 * DAY_MS;

  return NextResponse.json({
    ok: true,
    granularity,
    buckets: computeRevenueBuckets(ordersResult.orders, settings, nowMs),
    series: buildRevenueSeries(ordersResult.orders, granularity, nowMs - windowMs, nowMs, nowMs),
    refundHoldDays: settings.refundHoldDays,
    enrichment: {
      enrichedCount: ordersResult.enrichedCount,
      totalOrders: ordersResult.orders.length,
    },
  });
}
