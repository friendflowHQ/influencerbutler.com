// GET /api/admin/finance/tax?year=YYYY
//
// The Taxes tab: per-quarter net profit (cash basis) and recommended
// set-aside under the configured entity mode, plus deadlines and the
// merchant-of-record education copy.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinance } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { buildPnl } from "@/lib/finance-report";
import {
  taxQuartersForYear,
  nextDeadline,
  daysUntil,
  computeTaxSetAside,
  MOR_EDUCATION,
} from "@/lib/finance-tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const currentYear = new Date().getUTCFullYear();
  const yearParam = Number(url.searchParams.get("year"));
  const year =
    Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= currentYear + 1
      ? yearParam
      : currentYear;

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return ordersResult.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const quarters = [] as unknown[];
  for (const q of taxQuartersForYear(year)) {
    const pnl = await buildPnl(db, ordersResult.orders, q.periodStart, q.periodEnd, settings);
    if ("migrationPending" in pnl) return NextResponse.json({ migrationPending: true });
    quarters.push({
      ...q,
      netProfitCents: pnl.netProfitCents,
      revenueNetCents: pnl.revenue.netCents,
      expensesCents: pnl.totalExpensesCents,
      setAside: computeTaxSetAside(pnl.netProfitCents, settings),
      useTaxOwedCents: pnl.useTaxOwedCents,
      isPast: q.dueDate < today,
      daysUntilDue: daysUntil(today, q.dueDate),
    });
  }
  const useTaxOwedYearCents = quarters.reduce(
    (sum: number, q) => sum + ((q as { useTaxOwedCents?: number }).useTaxOwedCents ?? 0),
    0,
  );

  const upcoming = nextDeadline(today);
  return NextResponse.json({
    ok: true,
    year,
    taxMode: settings.taxMode,
    rates: {
      federalRatePercent: settings.federalRatePercent,
      utahRatePercent: settings.utahRatePercent,
      seTaxRatePercent: settings.seTaxRatePercent,
      seTaxBasePercent: settings.seTaxBasePercent,
      scorpDistributionRatePercent: settings.scorpDistributionRatePercent,
    },
    quarters,
    useTaxOwedYearCents,
    utahUseTaxRatePercent: settings.utahUseTaxRatePercent,
    nextDeadline: upcoming.quarter,
    morEducation: MOR_EDUCATION,
  });
}
