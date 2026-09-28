// /api/admin/finance/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// GET: the merged expense ledger (manual + seed + recurring expansion +
//      affiliate payouts) for the range; defaults to the current year.
// POST: add a manual expense.
// PATCH: edit a manual/seed expense (derived rows are read-only).
// DELETE ?id=: remove a manual/seed expense.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import {
  loadExpenses,
  isScheduleCKey,
  isUseTaxState,
  defaultUseTaxForCategory,
  SCHEDULE_C_CATEGORIES,
} from "@/lib/finance-expenses";

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

  const { from, to } = rangeFromQuery(new URL(request.url));
  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const result = await loadExpenses(db, from, to, settings);
  if (!result.ok) {
    return result.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    from,
    to,
    items: result.items,
    recurringTemplates: result.recurringTemplates,
    totalCents: result.totalCents,
    useTaxOwedCents: result.useTaxOwedCents,
    useTaxUnderReviewCents: result.useTaxUnderReviewCents,
    utahUseTaxRatePercent: settings.utahUseTaxRatePercent,
    categories: SCHEDULE_C_CATEGORIES,
  });
}

type ExpenseBody = {
  id?: string;
  vendor?: string;
  description?: string | null;
  category?: string;
  amountCents?: number;
  incurredOn?: string;
  useTax?: string;
};

function validateExpense(body: ExpenseBody): { error: string } | {
  vendor: string;
  description: string | null;
  category: string;
  amount_cents: number;
  incurred_on: string;
} {
  const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  if (!vendor) return { error: "Enter a vendor name." };
  if (!isScheduleCKey(body.category)) return { error: "Pick a category." };
  const amount = Math.round(Number(body.amountCents));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a positive amount." };
  const incurredOn = typeof body.incurredOn === "string" ? body.incurredOn.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) return { error: "Enter the date (YYYY-MM-DD)." };
  return {
    vendor,
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    category: body.category,
    amount_cents: amount,
    incurred_on: incurredOn,
  };
}

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: ExpenseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const validated = validateExpense(body);
  if ("error" in validated) return NextResponse.json(validated, { status: 400 });

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const useTax = isUseTaxState(body.useTax)
    ? body.useTax
    : defaultUseTaxForCategory(validated.category, settings.useTaxDefaultForSoftware);
  const { data, error } = await db
    .from("finance_expenses")
    .insert({ ...validated, use_tax: useTax, source: "manual", created_by: gate.actor.userId })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    console.error("finance expenses: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.expense.add",
    targetType: "finance_expense",
    targetId: (data?.id as string) ?? null,
    details: { vendor: validated.vendor, amountCents: validated.amount_cents },
  });
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

export async function PATCH(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: ExpenseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const validated = validateExpense(body);
  if ("error" in validated) return NextResponse.json(validated, { status: 400 });

  const db = createAdminClient();
  const useTaxPatch = isUseTaxState(body.useTax) ? { use_tax: body.useTax } : {};
  const { error } = await db
    .from("finance_expenses")
    .update({ ...validated, ...useTaxPatch, updated_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.expense.edit",
    targetType: "finance_expense",
    targetId: body.id,
    details: { vendor: validated.vendor, amountCents: validated.amount_cents },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("finance_expenses").delete().eq("id", id);
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.expense.delete",
    targetType: "finance_expense",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
