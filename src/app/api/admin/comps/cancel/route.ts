/**
 * POST /api/admin/comps/cancel  { lsSubscriptionId }
 *
 * Manually cancel a comped subscription now (the "Cancel now" button on the
 * Comps page). Cancels via Lemon Squeezy at period end, stamps the comp_grants
 * row, and audits the action. Gated on billing.cancel.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { cancelCompSubscription } from "@/lib/comps-cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsSubscriptionId?: string };

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

  const result = await cancelCompSubscription(id);

  await logAdminAction({
    actor,
    action: "comps.cancel",
    targetType: "subscription",
    targetId: id,
    details: { ok: result.ok, source: "admin-comps" },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Cancel failed" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
