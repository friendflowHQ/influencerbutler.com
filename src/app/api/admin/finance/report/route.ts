// GET /api/admin/finance/report?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]
//
// On-demand P&L / operating expense report. JSON for the Report tab, or a CSV
// attachment (P&L summary + itemized expense detail) when format=csv.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { loadExpenses } from "@/lib/finance-expenses";
import { buildPnlFromData, pnlToCsv } from "@/lib/finance-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rangeFromQuery(url: URL): { from: string; to: string } {
  const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (isDate(from) && isDate(to) && from <= to) return { from, to };
  const year = new Date().toISOString().slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const { from, to } = rangeFromQuery(url);
  const wantCsv = url.searchParams.get("format") === "csv";

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return ordersResult.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const expenses = await loadExpenses(db, from, to, settings);
  if (!expenses.ok) {
    return expenses.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const pnl = buildPnlFromData(ordersResult.orders, expenses.items, from, to, settings);

  if (wantCsv) {
    const csv = pnlToCsv(pnl, expenses.items);
    await logAdminAction({
      actor: gate.actor,
      action: "finance.report.export",
      targetType: "range",
      targetId: `${from}..${to}`,
      details: { expenseRows: expenses.items.length },
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pnl-${from}-to-${to}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: true, pnl, expenseItems: expenses.items });
}
