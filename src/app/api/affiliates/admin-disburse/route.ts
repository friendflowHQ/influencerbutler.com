import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { disburseAffiliate } from "@/lib/paypal-payouts";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { sendTaxReminderOnce } from "@/lib/tax-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disburse an affiliate's owed commissions via PayPal Payouts. Thin wrapper over
 * disburseAffiliate (src/lib/paypal-payouts.ts), which enforces preconditions
 * (tax verified + PayPal email + owed >= minimum), writes the ledger row before
 * the PayPal call (idempotency), and leaves orders unreconciled until the payout
 * actually succeeds (webhook / poller).
 */

type Body = { userId?: string; period?: string | null };

export async function POST(request: Request) {
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
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period) ? body.period : null;

  const outcome = await disburseAffiliate({
    admin: createAdminClient(),
    actorEmail: actor.email,
    userId,
    period,
  });

  if (!outcome.ok) {
    await logAdminAction({
      actor,
      action: "affiliate.commission.payout.error",
      targetType: "user",
      targetId: userId,
      details: { code: outcome.code ?? null, httpStatus: outcome.httpStatus },
    });

    // If the payout was blocked because the affiliate hasn't completed their
    // tax form or PayPal email, nudge them to fix it. Best-effort and throttled
    // to once per affiliate per month (shared with the monthly cron), and never
    // allowed to break the admin response.
    if (outcome.code === "tax_unverified" || outcome.code === "no_paypal") {
      try {
        const commissions = await loadAffiliateCommissions({
          userIds: [userId],
          period: period ?? undefined,
        });
        const stmt = commissions?.statements.find((s) => s.userId === userId) ?? null;
        if (stmt?.email && stmt.owedCents > 0) {
          await sendTaxReminderOnce(createAdminClient(), userId, {
            to: stmt.email,
            name: stmt.fullName,
            owedCents: stmt.owedCents,
            missingTax: outcome.code === "tax_unverified",
            missingPaypal: outcome.code === "no_paypal",
          });
        }
      } catch (error) {
        console.error("admin-disburse: tax reminder failed", error);
      }
    }

    return NextResponse.json(
      { ok: false, error: outcome.error, code: outcome.code, payout: outcome.existing ?? null },
      { status: outcome.httpStatus },
    );
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.payout",
    targetType: "user",
    targetId: userId,
    details: { payoutId: outcome.payoutId, period, grossCents: outcome.grossCents, payoutBatchId: outcome.payoutBatchId },
  });

  return NextResponse.json({
    ok: true,
    payoutId: outcome.payoutId,
    payoutBatchId: outcome.payoutBatchId,
    grossCents: outcome.grossCents,
    status: "processing",
  });
}
