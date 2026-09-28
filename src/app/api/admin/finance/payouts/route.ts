// /api/admin/finance/payouts
//
// GET: recorded LS bank payouts + the estimate-vs-recorded forecast.
// POST: record an actual payout that landed in the bank (amount, date, note).
// DELETE ?id=: remove a mis-entered payout row.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { computePayoutForecast, type RecordedPayout } from "@/lib/finance-ls-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  amount_cents: number;
  currency: string | null;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  note: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from("finance_payouts")
    .select("id,amount_cents,currency,paid_at,period_start,period_end,note,created_at")
    .order("paid_at", { ascending: false });
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const payouts = (data ?? []) as PayoutRow[];

  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return ordersResult.migrationPending
      ? NextResponse.json({ migrationPending: true })
      : NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const recorded: RecordedPayout[] = payouts.map((p) => ({
    id: p.id,
    amountCents: p.amount_cents,
    paidAt: p.paid_at.slice(0, 10),
    note: p.note,
  }));

  return NextResponse.json({
    ok: true,
    payouts,
    forecast: computePayoutForecast(ordersResult.orders, recorded, settings, Date.now()),
  });
}

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: {
    amountCents?: number;
    paidAt?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    note?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountCents = Math.round(Number(body.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
  }
  const paidAt = typeof body.paidAt === "string" ? body.paidAt.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
    return NextResponse.json({ error: "Enter the payout date (YYYY-MM-DD)." }, { status: 400 });
  }
  const dateOrNull = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null;

  const db = createAdminClient();
  const { data, error } = await db
    .from("finance_payouts")
    .insert({
      amount_cents: amountCents,
      paid_at: paidAt,
      period_start: dateOrNull(body.periodStart),
      period_end: dateOrNull(body.periodEnd),
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      created_by: gate.actor.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    console.error("finance payouts: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await logAdminAction({
    actor: gate.actor,
    action: "finance.payout.record",
    targetType: "finance_payout",
    targetId: (data?.id as string) ?? null,
    details: { amountCents, paidAt },
  });
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

export async function DELETE(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("finance_payouts").delete().eq("id", id);
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await logAdminAction({
    actor: gate.actor,
    action: "finance.payout.delete",
    targetType: "finance_payout",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
