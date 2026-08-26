// /api/admin/finance/recurring
//
// GET: recurring monthly expense templates.
// POST: create a template (vendor, category, amount, day, start date).
// PATCH: edit a template, or set cancelledOn to stop future occurrences.
//        To change an amount mid-stream, cancel and create a new template
//        (occurrences are expanded at read time from a single amount).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import {
  isScheduleCKey,
  isUseTaxState,
  defaultUseTaxForCategory,
} from "@/lib/finance-expenses";
import { loadFinanceSettings } from "@/lib/finance-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10));

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from("finance_recurring_expenses")
    .select("id,vendor,category,amount_cents,day_of_month,starts_on,cancelled_on,note,use_tax")
    .order("vendor", { ascending: true });
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, templates: data ?? [] });
}

type RecurringBody = {
  id?: string;
  vendor?: string;
  category?: string;
  amountCents?: number;
  dayOfMonth?: number;
  startsOn?: string;
  cancelledOn?: string | null;
  note?: string | null;
  useTax?: string;
};

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: RecurringBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  if (!vendor) return NextResponse.json({ error: "Enter a vendor name." }, { status: 400 });
  if (!isScheduleCKey(body.category)) {
    return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  }
  const amount = Math.round(Number(body.amountCents));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
  }
  const day = Math.round(Number(body.dayOfMonth ?? 1));
  if (!Number.isFinite(day) || day < 1 || day > 28) {
    return NextResponse.json({ error: "Day of month must be 1-28." }, { status: 400 });
  }
  if (!isDate(body.startsOn)) {
    return NextResponse.json({ error: "Enter the start date (YYYY-MM-DD)." }, { status: 400 });
  }

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const useTax = isUseTaxState(body.useTax)
    ? body.useTax
    : defaultUseTaxForCategory(body.category, settings.useTaxDefaultForSoftware);
  const { data, error } = await db
    .from("finance_recurring_expenses")
    .insert({
      vendor,
      category: body.category,
      amount_cents: amount,
      day_of_month: day,
      starts_on: body.startsOn.slice(0, 10),
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      use_tax: useTax,
      created_by: gate.actor.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    console.error("finance recurring: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.recurring.add",
    targetType: "finance_recurring_expense",
    targetId: (data?.id as string) ?? null,
    details: { vendor, amountCents: amount },
  });
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

export async function PATCH(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: RecurringBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.vendor === "string" && body.vendor.trim()) patch.vendor = body.vendor.trim();
  if (isScheduleCKey(body.category)) patch.category = body.category;
  if (body.amountCents !== undefined) {
    const amount = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
    }
    patch.amount_cents = amount;
  }
  if (body.dayOfMonth !== undefined) {
    const day = Math.round(Number(body.dayOfMonth));
    if (!Number.isFinite(day) || day < 1 || day > 28) {
      return NextResponse.json({ error: "Day of month must be 1-28." }, { status: 400 });
    }
    patch.day_of_month = day;
  }
  if (isDate(body.startsOn)) patch.starts_on = body.startsOn.slice(0, 10);
  // cancelledOn: a date stops occurrences from that date; explicit null re-activates.
  if (body.cancelledOn === null) patch.cancelled_on = null;
  else if (isDate(body.cancelledOn)) patch.cancelled_on = body.cancelledOn.slice(0, 10);
  if (typeof body.note === "string") patch.note = body.note.trim() || null;
  if (isUseTaxState(body.useTax)) patch.use_tax = body.useTax;

  const db = createAdminClient();
  const { error } = await db.from("finance_recurring_expenses").update(patch).eq("id", body.id);
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.recurring.edit",
    targetType: "finance_recurring_expense",
    targetId: body.id,
    details: patch,
  });
  return NextResponse.json({ ok: true });
}
