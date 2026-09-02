import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { recordManualPayout } from "@/lib/paypal-payouts";
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

type Body = { userId?: string; period?: string | null; externalRef?: string; sendReceipt?: boolean };

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

  return NextResponse.json({ ok: true, payoutId: outcome.payoutId, grossCents: outcome.grossCents });
}
