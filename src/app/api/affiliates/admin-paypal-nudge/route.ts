import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { crossSiteBlocked } from "@/lib/request-origin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { loadReadiness } from "@/lib/affiliate-readiness";
import { sendTaxFormReminder } from "@/lib/commission-statement-email";
import { currentMonth, markReminded, type ThrottleClient } from "@/lib/tax-reminder";
import { generateAffiliateMagicLink } from "@/lib/affiliate-magic-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/affiliates/admin-paypal-nudge
 *
 * One-off admin action: email every affiliate who has earned SOME commission
 * (payable + clearing > 0) but has no PayPal email on file, with a magic
 * sign-in link straight into their payout form (src/lib/affiliate-magic-link.ts)
 * instead of the plain login-gated dashboard URL the reminder normally links
 * to. Bypasses sendTaxReminderOnce's monthly throttle (this is an explicit
 * admin send, not the automatic cron) but still stamps this month's throttle
 * key afterward, so the cron doesn't double-send the same affiliate later.
 *
 * Body: { userIds?: string[] } - optional override; omit to auto-discover
 * everyone currently eligible (no need to hardcode names - this can be
 * re-run any time new affiliates fall into the same gap).
 */
export async function POST(request: Request) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;

  const actor = await requirePermission("affiliates.payout", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userIds?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine - falls through to auto-discovery.
  }
  const overrideIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id): id is string => typeof id === "string")
    : null;

  const admin = createAdminClient();
  const commissions = await loadAffiliateCommissions({});
  if (!commissions) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const candidates = overrideIds
    ? commissions.statements.filter((s) => overrideIds.includes(s.userId))
    : commissions.statements.filter((s) => s.payableCents + s.clearingCents > 0);

  const readiness = await loadReadiness(candidates.map((s) => s.userId));

  const sent: string[] = [];
  const skipped: { userId: string; reason: string }[] = [];

  for (const s of candidates) {
    const r = readiness.get(s.userId);
    if (r?.hasPaypal) {
      skipped.push({ userId: s.userId, reason: "already has a PayPal email" });
      continue;
    }
    if (!s.email) {
      skipped.push({ userId: s.userId, reason: "no account email on file" });
      continue;
    }

    const magicLink = await generateAffiliateMagicLink(s.email);
    const ok = await sendTaxFormReminder({
      to: s.email,
      name: s.fullName,
      owedCents: s.payableCents + s.clearingCents,
      missingTax: !r?.taxVerified,
      missingPaypal: true,
      magicLink,
    });

    if (ok) {
      await markReminded(admin as unknown as ThrottleClient, s.userId, currentMonth());
      sent.push(s.userId);
    } else {
      skipped.push({ userId: s.userId, reason: "send failed" });
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.paypal_nudge.sent",
    targetType: "system",
    targetId: overrideIds ? overrideIds.join(",") : "auto-discovered",
    details: { sentCount: sent.length, sent, skipped },
  });

  return NextResponse.json({ ok: true, sent, skipped });
}
