import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { disburseAffiliate, payoutMinimumCents } from "@/lib/paypal-payouts";
import { isAutopayArmed, autopayCapCents, autopayPeriod } from "@/lib/affiliate-autopay-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Super-admin verifies or rejects an affiliate's tax form. Verification is a
 * precondition for being paid out (see the disburse route). Rejecting records a
 * reason and drops the affiliate back to fix-and-resubmit.
 */

type Body = {
  userId?: string;
  action?: "verify" | "reject";
  reason?: string | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
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
  if (body.action !== "verify" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'verify' or 'reject'" }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const update =
    body.action === "verify"
      ? {
          status: "verified",
          verified_at: nowIso,
          verified_by: actor.email,
          rejected_reason: null,
          updated_at: nowIso,
        }
      : {
          status: "rejected",
          verified_at: null,
          verified_by: actor.email,
          rejected_reason:
            typeof body.reason === "string" && body.reason.trim().length > 0
              ? body.reason.trim()
              : "Please review and resubmit.",
          updated_at: nowIso,
        };

  const { error } = await admin
    .from("affiliate_tax_forms")
    .update(update)
    .eq("user_id", userId);

  if (error) {
    console.error("admin-tax-verify: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Auto-release: once a tax form is verified, an affiliate who was only blocked
  // by that form can be paid. If auto-pay is armed and their cleared, payable
  // balance is between the minimum and the review cap, disburse immediately so
  // they don't wait for the monthly run. Best-effort and wrapped: any failure
  // here must not fail the verify itself (disburseAffiliate re-checks every gate
  // and is idempotent, so this can't double-pay).
  let autoReleased: { amountCents: number } | null = null;
  if (body.action === "verify") {
    try {
      if (await isAutopayArmed(admin)) {
        const commissions = await loadAffiliateCommissions({ userIds: [userId] });
        const stmt = commissions?.statements.find((s) => s.userId === userId) ?? null;
        const payable = stmt?.payableCents ?? 0;
        const min = payoutMinimumCents();
        const cap = autopayCapCents();
        if (payable >= min && payable <= cap) {
          const outcome = await disburseAffiliate({
            admin,
            actorEmail: "auto:tax-verified",
            userId,
            period: autopayPeriod(),
          });
          if (outcome.ok) autoReleased = { amountCents: outcome.grossCents };
          else console.warn("admin-tax-verify: auto-release skipped", outcome.code, outcome.error);
        }
      }
    } catch (err) {
      console.error("admin-tax-verify: auto-release failed", err);
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.tax.review",
    targetType: "user",
    targetId: userId,
    details: { action: body.action, autoReleased },
  });

  return NextResponse.json({ ok: true, status: update.status, autoReleased });
}
