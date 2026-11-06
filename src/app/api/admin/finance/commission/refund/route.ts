// POST /api/admin/finance/commission/refund { ledgerId, amountCents?, reason? }
//
// Support refund of one Foyer payment on the creator's connected Stripe
// account (full or partial). Our 5% on the refunded amount is returned, the
// buyer and the creator are emailed by the links Worker, and the action is
// written to the admin audit log. Needs finance.manage + a fresh step-up.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin } from "@/lib/links-admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: { ledgerId?: unknown; amountCents?: unknown; reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ledgerId = typeof body.ledgerId === "string" ? body.ledgerId.trim() : "";
  if (!/^led_[a-f0-9]{8,64}$/.test(ledgerId)) return NextResponse.json({ error: "Pick a payment to refund." }, { status: 400 });
  const amountCents =
    body.amountCents === undefined || body.amountCents === null || body.amountCents === ""
      ? undefined
      : Math.round(Number(body.amountCents));
  if (amountCents !== undefined && (!Number.isFinite(amountCents) || amountCents <= 0)) {
    return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  const res = await callLinksAdmin<{ ok: boolean; refundId?: string; amountCents?: number; fullyRefunded?: boolean; error?: string }>(
    "/admin/commerce/refund",
    { method: "POST", body: { ledgerId, amountCents, reason, actor: gate.actor.email } },
  );

  await logAdminAction({
    actor: gate.actor,
    action: res.ok ? "foyer.refund" : "foyer.refund_failed",
    targetType: "foyer_payment",
    targetId: ledgerId,
    details: { amountCents: amountCents ?? "full", reason, result: res.ok ? res.data : { error: res.error } },
  });

  if (!res.ok) return NextResponse.json({ error: friendlyError(res.error) }, { status: res.status === 404 ? 404 : 400 });
  return NextResponse.json({ ok: true, ...(res.data as object) });
}

function friendlyError(code: string): string {
  switch (code) {
    case "already_refunded":
      return "This payment is already fully refunded.";
    case "amount_too_high":
      return "That is more than what is left to refund on this payment.";
    case "disputed":
      return "This payment is disputed. Respond to the dispute in Stripe instead of refunding.";
    case "stripe_not_connected":
      return "This creator's Stripe account is no longer connected.";
    case "not_found":
      return "Payment not found.";
    default:
      return code || "Refund failed.";
  }
}
