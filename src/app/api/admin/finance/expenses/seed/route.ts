// POST /api/admin/finance/expenses/seed?dry=1
//
// One-time import of the "Influencer Butler Costs" sheet data
// (src/lib/finance-seed-expenses.ts): recorded months as one-off expense rows
// plus recurring templates for the ongoing subscriptions. Idempotent via each
// row's external_ref unique key, so re-running never duplicates.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import {
  SEED_EXPENSES,
  SEED_RECURRING,
  seedExpenseRef,
  seedRecurringRef,
} from "@/lib/finance-seed-expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const db = createAdminClient();

  // What already exists (idempotency preview).
  const refs = [...SEED_EXPENSES.map(seedExpenseRef), ...SEED_RECURRING.map(seedRecurringRef)];
  const existing = new Set<string>();
  {
    const { data, error } = await db
      .from("finance_expenses")
      .select("external_ref")
      .in("external_ref", refs);
    if (error) {
      if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    for (const r of data ?? []) if (r.external_ref) existing.add(r.external_ref as string);
    const { data: recData } = await db
      .from("finance_recurring_expenses")
      .select("external_ref")
      .in("external_ref", refs);
    for (const r of recData ?? []) if (r.external_ref) existing.add(r.external_ref as string);
  }

  const newExpenses = SEED_EXPENSES.filter((e) => !existing.has(seedExpenseRef(e)));
  const newRecurring = SEED_RECURRING.filter((r) => !existing.has(seedRecurringRef(r)));

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      wouldInsertExpenses: newExpenses,
      wouldInsertRecurring: newRecurring,
      alreadyImported: existing.size,
    });
  }

  if (newExpenses.length > 0) {
    const { error } = await db.from("finance_expenses").insert(
      newExpenses.map((e) => ({
        vendor: e.vendor,
        category: e.category,
        amount_cents: e.amountCents,
        incurred_on: e.incurredOn,
        source: "seed",
        external_ref: seedExpenseRef(e),
        created_by: gate.actor.userId,
      })),
    );
    if (error) {
      if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
      console.error("finance seed: expense insert failed", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }
  }

  if (newRecurring.length > 0) {
    const { error } = await db.from("finance_recurring_expenses").insert(
      newRecurring.map((r) => ({
        vendor: r.vendor,
        category: r.category,
        amount_cents: r.amountCents,
        day_of_month: r.dayOfMonth ?? 1,
        starts_on: r.startsOn,
        note: r.note,
        external_ref: seedRecurringRef(r),
        created_by: gate.actor.userId,
      })),
    );
    if (error) {
      if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
      console.error("finance seed: recurring insert failed", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }
  }

  await logAdminAction({
    actor: gate.actor,
    action: "finance.expenses.seed",
    targetType: "seed",
    targetId: "cost-sheet",
    details: { expenses: newExpenses.length, recurring: newRecurring.length },
  });

  return NextResponse.json({
    ok: true,
    insertedExpenses: newExpenses.length,
    insertedRecurring: newRecurring.length,
    skippedExisting: existing.size,
  });
}
