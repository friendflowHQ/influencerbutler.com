import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate sets their PayPal payout email. A PayPal email is a payout
 * destination, not a credential, so it is safe to collect. This is a
 * precondition for being paid out (see the disburse route).
 */

type Body = { paypalEmail?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = userData.user;

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
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });
    }

    const { error } = await admin
      .from("profiles")
      .update({
        paypal_email: paypalEmail,
        payout_method: "paypal",
        payout_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("payout-method: update failed", error);
      return NextResponse.json({ error: "Could not save payout method" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paypalEmail });
  } catch (err) {
    console.error("payout-method error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
