// P&L / operating expense report builder + CSV export for the Finance section.
//
// Cash-basis for a date range [from, to] (YYYY-MM-DD, inclusive):
//   revenue: orders CREATED in the range (net of LS-remitted tax), refunds by
//   refund date, LS fees estimated from the configurable fee params.
//   expenses: the merged expense ledger (manual + seed + recurring + affiliate
//   payouts) for the same range, grouped by Schedule C category.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceOrder } from "@/lib/finance-orders-data";
import type { FinanceSettings } from "@/lib/finance-settings";
import { loadExpenses, categoryLabel, SCHEDULE_C_CATEGORIES } from "@/lib/finance-expenses";
import { computeTaxSetAside, type TaxSetAside } from "@/lib/finance-tax";

export type PnlCategoryRow = {
  category: string;
  label: string;
  line: string;
  amountCents: number;
};

export type Pnl = {
  from: string;
  to: string;
  revenue: {
    grossCents: number;
    taxRemittedByLsCents: number;
    refundsCents: number;
    estimatedLsFeesCents: number;
    netCents: number;
  };
  expensesByCategory: PnlCategoryRow[];
  totalExpensesCents: number;
  netProfitCents: number;
  taxSetAside: TaxSetAside;
};

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

/** Pure P&L math over pre-loaded orders + expense items. */
export function buildPnlFromData(
  orders: FinanceOrder[],
  expenseItems: { category: string; amountCents: number }[],
  from: string,
  to: string,
  settings: FinanceSettings,
): Pnl {
  let gross = 0;
  let taxRemitted = 0;
  let fees = 0;
  let refunds = 0;
  for (const order of orders) {
    if (inRange(order.createdAt, from, to)) {
      const base = order.totalUsdCents - order.taxUsdCents;
      gross += order.totalUsdCents;
      taxRemitted += order.taxUsdCents;
      if (base > 0) {
        fees += Math.round((base * settings.lsFeePercent) / 100) + settings.lsFeeFixedCents;
      }
    }
    if (order.refundedUsdCents > 0 && inRange(order.refundedAt, from, to)) {
      refunds += order.refundedUsdCents;
    }
  }
  const netRevenue = gross - taxRemitted - refunds - fees;

  const byCategory = new Map<string, number>();
  let totalExpenses = 0;
  for (const item of expenseItems) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amountCents);
    totalExpenses += item.amountCents;
  }
  const expensesByCategory: PnlCategoryRow[] = SCHEDULE_C_CATEGORIES.filter((c) =>
    byCategory.has(c.key),
  ).map((c) => ({
    category: c.key,
    label: c.label,
    line: c.line,
    amountCents: byCategory.get(c.key) ?? 0,
  }));

  const netProfit = netRevenue - totalExpenses;
  return {
    from,
    to,
    revenue: {
      grossCents: gross,
      taxRemittedByLsCents: taxRemitted,
      refundsCents: refunds,
      estimatedLsFeesCents: fees,
      netCents: netRevenue,
    },
    expensesByCategory,
    totalExpensesCents: totalExpenses,
    netProfitCents: netProfit,
    taxSetAside: computeTaxSetAside(netProfit, settings),
  };
}

/** Loads expenses and combines with pre-loaded orders into a P&L. */
export async function buildPnl(
  db: SupabaseClient,
  orders: FinanceOrder[],
  from: string,
  to: string,
  settings: FinanceSettings,
): Promise<Pnl | { migrationPending: true }> {
  const expenses = await loadExpenses(db, from, to, settings);
  if (!expenses.ok) return { migrationPending: true };
  return buildPnlFromData(orders, expenses.items, from, to, settings);
}

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** CSV of the P&L plus an itemized expense section, for on-demand export. */
export function pnlToCsv(
  pnl: Pnl,
  expenseItems: { date: string; vendor: string; description: string | null; category: string; amountCents: number; source: string }[],
): string {
  const rows: string[] = [];
  rows.push(`Profit & Loss,${pnl.from} to ${pnl.to}`);
  rows.push("");
  rows.push("Section,Item,Amount USD");
  rows.push(`Revenue,Gross sales (incl. LS-remitted tax),${usd(pnl.revenue.grossCents)}`);
  rows.push(`Revenue,Sales tax remitted by Lemon Squeezy,-${usd(pnl.revenue.taxRemittedByLsCents)}`);
  rows.push(`Revenue,Refunds,-${usd(pnl.revenue.refundsCents)}`);
  rows.push(`Revenue,Estimated Lemon Squeezy fees,-${usd(pnl.revenue.estimatedLsFeesCents)}`);
  rows.push(`Revenue,Net revenue,${usd(pnl.revenue.netCents)}`);
  for (const c of pnl.expensesByCategory) {
    rows.push(`Expenses,${csvField(`${c.label} (${c.line})`)},-${usd(c.amountCents)}`);
  }
  rows.push(`Expenses,Total expenses,-${usd(pnl.totalExpensesCents)}`);
  rows.push(`Profit,Net profit,${usd(pnl.netProfitCents)}`);
  rows.push(`Tax planning,Recommended set-aside,${usd(pnl.taxSetAside.totalCents)}`);
  rows.push("");
  rows.push("Expense detail");
  rows.push("Date,Vendor,Description,Category,Source,Amount USD");
  for (const e of expenseItems) {
    rows.push(
      [
        csvField(e.date),
        csvField(e.vendor),
        csvField(e.description),
        csvField(categoryLabel(e.category)),
        csvField(e.source),
        usd(e.amountCents),
      ].join(","),
    );
  }
  return rows.join("\n");
}
