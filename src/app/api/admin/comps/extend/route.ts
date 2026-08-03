/**
 * POST /api/admin/comps/extend  { lsSubscriptionId, days }
 *
 * Add N days to an in-house comp's free window. In-house comps live entirely in
 * Supabase (synthetic subscription + license key + comp_grants row, sentinel id
 * `comp:<uuid>`) and are gated by comp_grants.expires_at, which the comp-expiry
 * cron reads to decide when to drop the user to Free. So extending a comp is a
 * pure DB operation: push out expires_at, clear the cancel/warn markers, and make
 * sure the synthetic subscription is active (revives one the cron already ended).
 *
 * We add days to the CURRENT expiry when it is still in the future, else from now,
 * so a top-up on a live comp stacks and a lapsed comp is revived from today. The
 * grant stays day-granular (months = null), so its state keeps deriving from the
 * explicit expires_at rather than a whole-month count. Gated on licenses.view,
 * matching the set-months action on the same Comps page.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";
import { addDaysUtc } from "@/lib/comp-codes";
import { IN_HOUSE_SUB_PREFIX } from "@/lib/comps-cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DAYS = 365;

type Body = { lsSubscriptionId?: string; days?: number };

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
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
  const days = Number(body.days);
  if (!id) {
    return NextResponse.json({ error: "Missing lsSubscriptionId" }, { status: 400 });
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ error: `days must be 1-${MAX_DAYS}` }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: grant, error: grantErr } = await svc
    .from("comp_grants")
    .select("expires_at,source")
    .eq("ls_subscription_id", id)
    .maybeSingle();
  if (grantErr) {
    console.error("comps/extend grant lookup failed", grantErr);
    return NextResponse.json({ error: "Could not load the comp." }, { status: 500 });
  }
  if (!grant) {
    return NextResponse.json({ error: "No comp found for that subscription." }, { status: 404 });
  }

  // In-house only: LS-backed comps have a real subscription that must be extended
  // in Lemon Squeezy, not by rewriting a Supabase timestamp.
  const isInHouse = id.startsWith(IN_HOUSE_SUB_PREFIX) || grant.source === "in_house";
  if (!isInHouse) {
    return NextResponse.json(
      { error: "This is a Lemon Squeezy comp: extend it in the Lemon Squeezy dashboard." },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const currentExpiry = typeof grant.expires_at === "string" ? grant.expires_at : null;
  // Top up from the current expiry while it is still in the future; otherwise start
  // from now so a lapsed comp is revived for the full new window.
  const base = currentExpiry && new Date(currentExpiry).getTime() > Date.now() ? currentExpiry : nowIso;
  const newExpiry = addDaysUtc(base, days);

  const { error: grantUpdateErr } = await svc
    .from("comp_grants")
    .update({
      expires_at: newExpiry,
      cancelled_at: null,
      cancel_result: null,
      warn7_sent_at: null,
      warn1_sent_at: null,
      months: null,
      updated_at: nowIso,
    })
    .eq("ls_subscription_id", id);
  if (grantUpdateErr) {
    console.error("comps/extend grant update failed", grantUpdateErr);
    return NextResponse.json({ error: "Could not save the new expiry." }, { status: 500 });
  }

  // Revive the entitlement: if the cron already cancelled this comp, flip the
  // synthetic subscription back to active. In-house comps are only ever active or
  // cancelled, so this is safe to apply unconditionally.
  const { error: subUpdateErr } = await svc
    .from("subscriptions")
    .update({ status: "active", ends_at: null })
    .eq("ls_subscription_id", id);
  if (subUpdateErr) {
    console.error("comps/extend subscription reactivate failed", subUpdateErr);
    return NextResponse.json({ error: "Extended the window but could not reactivate access." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "comps.extend",
    targetType: "subscription",
    targetId: id,
    details: { days, newExpiry },
  });

  return NextResponse.json({ ok: true, expiresAt: newExpiry });
}
