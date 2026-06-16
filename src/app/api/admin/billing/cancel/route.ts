import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
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

  await logAdminAction({
    actor,
    action: "billing.cancel",
    targetType: "subscription",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
