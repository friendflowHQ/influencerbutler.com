import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { adminService } from "@/lib/admin-service";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsSubscriptionId?: string };

/**
 * Cancels a subscription via the Lemon Squeezy API. LS cancels at the end of the
 * current billing period (the customer keeps access until then). Gated by
 * billing.cancel and audited.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("billing.cancel", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.lsSubscriptionId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing lsSubscriptionId" }, { status: 400 });
  }

  const res = await lsApi(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("billing/cancel: LS cancel failed", res.status, text.slice(0, 300));
    return NextResponse.json(
      { error: `Lemon Squeezy cancel failed (${res.status}).` },
      { status: 502 },
    );
  }

  // Mark our local row cancelled right away so the admin UI reflects it on the
  // next lookup, instead of waiting on the (laggy) subscription_cancelled
  // webhook. Same approach as supersedeStaleTrials in the LS webhook handler.
  // Best-effort: the LS cancel already succeeded, so don't fail on a write
  // error. ends_at is left for the webhook to fill in.
  const svc = adminService();
  if (svc) {
    const { error: updateError } = await svc
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("ls_subscription_id", id);
    if (updateError) {
      console.error("billing/cancel: local subscriptions update failed", updateError);
    }
  }

  await logAdminAction({
    actor,
    action: "billing.cancel",
    targetType: "subscription",
    targetId: id,
  });

  return NextResponse.json({
    ok: true,
    message: "Subscription cancelled. Access continues until the end of the billing period.",
  });
}
