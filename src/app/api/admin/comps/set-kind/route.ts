/**
 * POST /api/admin/comps/set-kind  { lsSubscriptionId, kind }
 *
 * Relabel a comp (comp_grants.kind). The label decides which end-of-comp
 * messages go out: win-back and creator comps get the customer emails, banner
 * and thank-you wording; affiliate passes, trials and referral rewards do not.
 * Gated on licenses.view like the rest of the Comps page. Audited.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["winback", "creator", "affiliate", "trial", "referral", "invite"]);

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { lsSubscriptionId?: string; kind?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.lsSubscriptionId ?? "").trim();
  const kind = (body.kind ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing lsSubscriptionId" }, { status: 400 });
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });

  const svc = adminService();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  const { error } = await svc
    .from("comp_grants")
    .update({ kind, updated_at: new Date().toISOString() })
    .eq("ls_subscription_id", id);
  if (error) {
    console.error("comps/set-kind failed", error);
    return NextResponse.json(
      { error: "Could not save. Has the 20261108_comp_conversion.sql migration been applied?" },
      { status: 500 },
    );
  }
  await logAdminAction({
    actor,
    action: "comps.set_kind",
    targetType: "subscription",
    targetId: id,
    details: { kind },
  });
  return NextResponse.json({ ok: true });
}
