/**
 * POST /api/admin/cancellations/reach-out
 * Body: { id }
 *
 * Manual, on-demand version of the winback "comp" t2 email, for a specific
 * subscription_cancel_reasons row - mainly rows that cancelled before the
 * in-funnel feature-ask + 2-months-free offer shipped, so they never saw it.
 * Reuses the existing WINBACK_COPY.comp.t2 copy and claim-link mechanism
 * verbatim; clicking the link still runs through the unmodified
 * /api/winback/claim flow to mint the comp.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWinbackEmail, winbackClaimUrl } from "@/lib/winback-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReachOutBody = { id?: string };

export async function POST(request: Request) {
  const actor = await requirePermission("cancellations.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: ReachOutBody;
  try {
    body = (await request.json()) as ReachOutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("subscription_cancel_reasons")
    .select("id,user_id,reason,winback_comp_claimed_at")
    .eq("id", id)
    .maybeSingle();

  if (!row || typeof row.user_id !== "string") {
    return NextResponse.json({ error: "Cancellation row not found" }, { status: 404 });
  }

  if (row.winback_comp_claimed_at) {
    return NextResponse.json(
      { error: "This customer already claimed a free-months comp." },
      { status: 409 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("id", row.user_id)
    .maybeSingle();
  const email = typeof profile?.email === "string" ? profile.email : "";
  if (!email) return NextResponse.json({ error: "No email on file for this user" }, { status: 422 });
  const name = typeof profile?.full_name === "string" ? profile.full_name : "";

  const reason = typeof row.reason === "string" ? row.reason : null;

  const sent = await sendWinbackEmail({
    segment: "comp",
    tier: "t2",
    to: email,
    name,
    reason,
    claimUrl: winbackClaimUrl(row.id),
  });

  if (!sent) return NextResponse.json({ error: "Send failed" }, { status: 502 });

  await supabase
    .from("subscription_cancel_reasons")
    .update({ manual_offer_sent_at: new Date().toISOString() })
    .eq("id", id);

  await logAdminAction({
    actor,
    action: "cancellations.reach_out",
    targetType: "subscription_cancel_reasons",
    targetId: id,
    details: { email, reason },
  });

  return NextResponse.json({ ok: true });
}
