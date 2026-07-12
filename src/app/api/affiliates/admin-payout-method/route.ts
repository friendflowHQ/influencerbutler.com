import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin sets an affiliate's PayPal payout email on their behalf, from the
 * "view as affiliate" page. Mirrors the self route /api/affiliates/payout-method
 * but is keyed on a target ?userId= and gated behind affiliates.payout (the
 * admin-only permission), since a payout destination is where money is sent.
 * Every change is audit-logged.
 */

type Body = { paypalEmail?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("affiliates.payout", request);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const paypalEmail = (body.paypalEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(paypalEmail)) {
      return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("is_affiliate")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 404 });
    }

    const { error } = await admin
      .from("profiles")
      .update({
        paypal_email: paypalEmail,
        payout_method: "paypal",
        payout_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("admin-payout-method: update failed", error);
      return NextResponse.json({ error: "Could not save payout method" }, { status: 500 });
    }

    await logAdminAction({
      actor,
      action: "affiliate.payout.update",
      targetType: "user",
      targetId: userId,
      details: { paypalEmail },
    });

    return NextResponse.json({ ok: true, paypalEmail });
  } catch (err) {
    console.error("admin-payout-method error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
