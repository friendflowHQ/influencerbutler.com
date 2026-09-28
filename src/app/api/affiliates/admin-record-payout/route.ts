import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { recordManualPayout } from "@/lib/paypal-payouts";
import { isMigrationPendingError } from "@/lib/finance-stepup";
import { crossSiteBlocked } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record an out-of-band affiliate payment (the admin already sent money via
 * PayPal's own UI, a bank transfer, etc.) against the ledger. Reconciles ONLY
 * the currently-payable slice using the same money-safe path as a real PayPal
 * payout (recordManualPayout -> applyPayoutStatus), so amortized annual orders
 * stay partially owed and are never double-counted next month. No money moves
 * here. Gated behind affiliates.payout (it writes a money record) and the exact
 * amount is recomputed server-side (the client never supplies an amount).
 */

type Body = {
  userId?: string;
  period?: string | null;
  externalRef?: string;
  sendReceipt?: boolean;
  // Total the admin actually sent (cents). Anything above the recorded
  // commission slice is booked as a PayPal fee expense in Finance.
  totalSentCents?: number;
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;

  const actor = await requirePermission("affiliates.payout", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period) ? body.period : currentPeriod();
  const externalRef =
    typeof body.externalRef === "string" && body.externalRef.trim().length > 0
      ? body.externalRef.trim()
      : null;

  const outcome = await recordManualPayout({
    admin: createAdminClient(),
    actorEmail: actor.email,
    userId,
    period,
    externalRef,
    sendReceipt: body.sendReceipt === true,
  });

  if (!outcome.ok) {
    await logAdminAction({
      actor,
      action: "affiliate.commission.record_manual.error",
      targetType: "user",
      targetId: userId,
      details: { code: outcome.code ?? null, httpStatus: outcome.httpStatus, period },
    });
    return NextResponse.json(
      { ok: false, error: outcome.error, code: outcome.code, payout: outcome.existing ?? null },
      { status: outcome.httpStatus },
    );
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.record_manual",
    targetType: "user",
    targetId: userId,
    details: { payoutId: outcome.payoutId, period, grossCents: outcome.grossCents, externalRef },
  });

  // If the admin sent MORE than the recorded commission (e.g. grossed up to
  // cover PayPal's goods-and-services fee), book the difference as a PayPal-fee
  // expense in Finance, so the books match the actual cash out. The commission
  // itself is already an expense there (loadExpenses reads affiliate_payouts).
  // Idempotent via a per-payout external_ref; gated on finance.manage so this
  // never lets an affiliates-only admin write finance rows. Best-effort: a
  // pending finance migration or a permission gap just skips it (feeRecorded
  // false) and the UI tells the admin to add it by hand.
  const totalSentCents =
    typeof body.totalSentCents === "number" && Number.isFinite(body.totalSentCents)
      ? Math.round(body.totalSentCents)
      : null;
  const feeCents = totalSentCents !== null ? Math.max(0, totalSentCents - outcome.grossCents) : 0;
  let feeRecorded = false;
  if (feeCents > 0) {
    const financeActor = await requirePermission("finance.manage", request);
    if (financeActor) {
      try {
        const admin = createAdminClient();
        const today = new Date().toISOString().slice(0, 10);
        const { error } = await admin
          .from("finance_expenses")
          .insert({
            vendor: "PayPal fee (affiliate payout)",
            description: `Fee on manual affiliate payout${period ? `, period ${period}` : ""}`,
            category: "commissions_fees",
            amount_cents: feeCents,
            currency: "USD",
            incurred_on: today,
            use_tax: "na",
            source: "manual",
            external_ref: `payout_fee:${outcome.payoutId}`,
            created_by: financeActor.userId,
          });
        // A duplicate external_ref (23505) means the fee is already on the books.
        if (!error || (error as { code?: string }).code === "23505") {
          feeRecorded = true;
        } else if (!isMigrationPendingError(error)) {
          console.error("admin-record-payout: fee expense insert failed", error);
        }
      } catch (err) {
        console.error("admin-record-payout: fee expense insert threw", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    payoutId: outcome.payoutId,
    grossCents: outcome.grossCents,
    feeCents,
    feeRecorded,
  });
}
