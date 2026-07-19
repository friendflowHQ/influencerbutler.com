import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadReferredSignups } from "@/lib/referred-signups-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate "Referred signups" funnel: free signups (profiles stamped at
 * account creation), trials, conversions, active and cancelled subs referred
 * by the calling affiliate - plus an anonymous recent-event feed (type +
 * timestamp only, never any customer identity).
 *
 * The reads live in loadReferredSignups (shared with the admin "view as"
 * endpoint) and use the admin client after the is_affiliate gate.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = userData.user;

    const admin = createAdminClient();

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_affiliate")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("referred-signups: profile query failed", profileErr);
      return NextResponse.json({ error: "Could not load affiliate" }, { status: 500 });
    }
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });
    }

    const payload = await loadReferredSignups(admin, user.id);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("referred-signups error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
