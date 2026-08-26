// Operating expense model for the Finance dashboard.
//
// Three sources merge into one ledger:
//   1. finance_expenses: manual entries + seed-imported rows (editable).
//   2. finance_recurring_expenses: monthly subscription templates, expanded at
//      read time between starts_on and cancelled_on (never materialized). To
//      change an amount mid-stream, cancel the template and create a new one.
//   3. affiliate_payouts (status success): commissions paid via PayPal,
//      auto-included as a commissions expense (plus the optional configurable
//      PayPal sender fee per payout).
//
// Categories map to IRS Schedule C lines for the P&L export.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceSettings } from "@/lib/finance-settings";
import { isMigrationPendingError } from "@/lib/finance-stepup";

export const SCHEDULE_C_CATEGORIES = [
  { key: "advertising", label: "Advertising", line: "Line 8" },
  { key: "commissions_fees", label: "Commissions & fees", line: "Line 10" },
  { key: "insurance", label: "Insurance", line: "Line 15" },
  { key: "legal_professional", label: "Legal & professional services", line: "Line 17" },
  { key: "office_expense", label: "Office expense", line: "Line 18" },
  { key: "supplies", label: "Supplies", line: "Line 22" },
  { key: "taxes_licenses", label: "Taxes & licenses", line: "Line 23" },
  { key: "utilities", label: "Utilities", line: "Line 25" },
  { key: "software_hosting", label: "Software & hosting", line: "Line 27a (Other)" },
  { key: "other", label: "Other", line: "Line 27a (Other)" },
] as const;

export type ScheduleCKey = (typeof SCHEDULE_C_CATEGORIES)[number]["key"];

const CATEGORY_KEYS = new Set<string>(SCHEDULE_C_CATEGORIES.map((c) => c.key));

export function isScheduleCKey(value: unknown): value is ScheduleCKey {
  return typeof value === "string" && CATEGORY_KEYS.has(value);
}

export function categoryLabel(key: string): string {
  return SCHEDULE_C_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export type ExpenseSource = "manual" | "seed" | "recurring" | "affiliate_payout";

export type ExpenseItem = {
  /** Row id for editable sources; template/payout id otherwise. */
  id: string;
  vendor: string;
  description: string | null;
  category: ScheduleCKey;
  amountCents: number;
  /** YYYY-MM-DD the expense was incurred. */
  date: string;
  source: ExpenseSource;
  /** Only manual/seed rows can be edited or deleted from the Expenses tab. */
  editable: boolean;
};

export type RecurringTemplate = {
  id: string;
  vendor: string;
  category: ScheduleCKey;
  amountCents: number;
  dayOfMonth: number;
  startsOn: string; // YYYY-MM-DD
  cancelledOn: string | null;
  note: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Expands recurring templates into one occurrence per month whose occurrence
 * date falls inside [from, to] (dates as YYYY-MM-DD, inclusive). An occurrence
 * exists when starts_on <= date and (no cancelled_on or date < cancelled_on).
 * Pure, so it is unit-testable.
 */
export function expandRecurring(
  templates: RecurringTemplate[],
  from: string,
  to: string,
): ExpenseItem[] {
  const out: ExpenseItem[] = [];
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return out;

  for (const t of templates) {
    let year = fromDate.getUTCFullYear();
    let month = fromDate.getUTCMonth() + 1; // 1-based
    for (let i = 0; i < 240; i++) {
      const date = `${year}-${pad2(month)}-${pad2(t.dayOfMonth)}`;
      if (date > to) break;
      if (date >= from && date >= t.startsOn && (!t.cancelledOn || date < t.cancelledOn)) {
        out.push({
          id: `${t.id}:${date}`,
          vendor: t.vendor,
          description: t.note,
          category: t.category,
          amountCents: t.amountCents,
          date,
          source: "recurring",
          editable: false,
        });
      }
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return out;
}

export type ExpensesResult =
  | {
      ok: true;
      items: ExpenseItem[];
      recurringTemplates: RecurringTemplate[];
      totalCents: number;
    }
  | { ok: false; migrationPending: boolean };

/** Loads and merges all expense sources for [from, to] (YYYY-MM-DD, inclusive). */
export async function loadExpenses(
  db: SupabaseClient,
  from: string,
  to: string,
  settings: FinanceSettings,
): Promise<ExpensesResult> {
  const items: ExpenseItem[] = [];

  // 1. Manual + seed rows.
  const { data: manualRows, error: manualError } = await db
    .from("finance_expenses")
    .select("id,vendor,description,category,amount_cents,incurred_on,source")
    .gte("incurred_on", from)
    .lte("incurred_on", to)
    .order("incurred_on", { ascending: false });
  if (manualError) {
    if (isMigrationPendingError(manualError)) return { ok: false, migrationPending: true };
    console.error("loadExpenses: finance_expenses query failed", manualError);
    return { ok: false, migrationPending: false };
  }
  for (const r of manualRows ?? []) {
    items.push({
      id: r.id as string,
      vendor: (r.vendor as string) ?? "",
      description: (r.description as string | null) ?? null,
      category: isScheduleCKey(r.category) ? r.category : "other",
      amountCents: (r.amount_cents as number) ?? 0,
      date: ((r.incurred_on as string) ?? "").slice(0, 10),
      source: r.source === "seed" ? "seed" : "manual",
      editable: true,
    });
  }

  // 2. Recurring templates, expanded at read time.
  const { data: recurringRows, error: recurringError } = await db
    .from("finance_recurring_expenses")
    .select("id,vendor,category,amount_cents,day_of_month,starts_on,cancelled_on,note")
    .order("vendor", { ascending: true });
  if (recurringError) {
    if (isMigrationPendingError(recurringError)) return { ok: false, migrationPending: true };
    console.error("loadExpenses: recurring query failed", recurringError);
    return { ok: false, migrationPending: false };
  }
  const templates: RecurringTemplate[] = (recurringRows ?? []).map((r) => ({
    id: r.id as string,
    vendor: (r.vendor as string) ?? "",
    category: isScheduleCKey(r.category) ? r.category : "other",
    amountCents: (r.amount_cents as number) ?? 0,
    dayOfMonth: (r.day_of_month as number) ?? 1,
    startsOn: ((r.starts_on as string) ?? "").slice(0, 10),
    cancelledOn: r.cancelled_on ? (r.cancelled_on as string).slice(0, 10) : null,
    note: (r.note as string | null) ?? null,
  }));
  items.push(...expandRecurring(templates, from, to));

  // 3. Affiliate payouts (commission expense), by paid_at.
  const { data: payoutRows, error: payoutError } = await db
    .from("affiliate_payouts")
    .select("id,gross_cents,paid_at,period,paypal_email")
    .eq("status", "success")
    .gte("paid_at", `${from}T00:00:00Z`)
    .lte("paid_at", `${to}T23:59:59Z`);
  if (payoutError) {
    console.error("loadExpenses: affiliate_payouts query failed", payoutError);
  } else {
    for (const p of payoutRows ?? []) {
      const gross = (p.gross_cents as number) ?? 0;
      const amount = gross + settings.paypalSenderFeePerPayoutCents;
      if (amount <= 0) continue;
      items.push({
        id: p.id as string,
        vendor: "Affiliate commission (PayPal)",
        description: [
          p.period ? `Period ${p.period}` : null,
          (p.paypal_email as string | null) ?? null,
          settings.paypalSenderFeePerPayoutCents > 0
            ? `incl. ${settings.paypalSenderFeePerPayoutCents}c sender fee`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || null,
        category: "commissions_fees",
        amountCents: amount,
        date: ((p.paid_at as string) ?? "").slice(0, 10),
        source: "affiliate_payout",
        editable: false,
      });
    }
  }

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  return { ok: true, items, recurringTemplates: templates, totalCents };
}
