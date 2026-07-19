import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { captureSignupReferral } from "@/lib/referral-signup-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stamps the first-touch affiliate referral (ib_aff_src cookie) onto the
 * caller's own freshly created profile. Covers the confirmation-disabled
 * signup path (dev / self-host), where the account gets a session
 * immediately client-side and never passes through /api/auth/callback.
 *
 * No request body is accepted on purpose: the affiliate code comes only from
 * the server-read cookie, so a client cannot inject an arbitrary code. The
 * helper's internal guards (new-account window, real-affiliate lookup,
 * self-referral, first-touch) make repeat calls harmless.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await captureSignupReferral({
      userId: userData.user.id,
      userCreatedAt: userData.user.created_at ?? null,
      userEmail: userData.user.email ?? null,
      cookieStore: await cookies(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("capture-ref error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
