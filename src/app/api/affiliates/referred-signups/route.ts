import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveReferredSignups,
  type ReferredProfileRow,
  type ReferredSubscriptionRow,
} from "@/lib/referred-signups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate "Referred signups" funnel: free signups (profiles stamped at
 * account creation), trials, conversions, active and cancelled subs referred
 * by the calling affiliate - plus an anonymous recent-event feed (type +
 * timestamp only, never any customer identity).
 *
 * Reads use the admin client after the is_affiliate gate: subscriptions has
 * RLS with no SELECT policy, and profiles rows here belong to OTHER users.
 * If the 20260719 migration hasn't been hand-applied to prod yet, the
 * profiles read fails on the missing column and we degrade to zeros with
 * migrationPending: true instead of 500ing.
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

    let migrationPending = false;

    let profileRows: ReferredProfileRow[] = [];
    const { data: signupData, error: signupErr } = await admin
      .from("profiles")
      .select("created_at,ref_captured_at")
      .eq("ref_affiliate_user_id", user.id)
      .order("ref_captured_at", { ascending: false })
      .limit(200);
    if (signupErr) {
      // Most likely the ref_* columns don't exist in prod yet.
      console.warn("referred-signups: signups read skipped", signupErr);
      migrationPending = true;
    } else {
      profileRows = (signupData ?? []) as ReferredProfileRow[];
    }

    let subRows: ReferredSubscriptionRow[] = [];
    const { data: subData, error: subErr } = await admin
      .from("subscriptions")
      .select("user_id,status,trial_started_at,trial_converted_at,pro_started_at,ends_at")
      .eq("ref_affiliate_user_id", user.id)
      .limit(200);
    if (subErr) {
      // Prod lagged 20260618_pro_welcome_funnel for a while, so pro_started_at
      // may not exist yet. Retry without it rather than losing the whole
      // trial/paid funnel; the derivation infers direct-Pro buys from status.
      console.warn("referred-signups: full subscriptions read failed, retrying reduced", subErr);
      const { data: reducedData, error: reducedErr } = await admin
        .from("subscriptions")
        .select("user_id,status,trial_started_at,trial_converted_at,ends_at")
        .eq("ref_affiliate_user_id", user.id)
        .limit(200);
      if (reducedErr) {
        console.warn("referred-signups: subscriptions read skipped", reducedErr);
      } else {
        subRows = ((reducedData ?? []) as Omit<ReferredSubscriptionRow, "pro_started_at">[]).map(
          (row) => ({ ...row, pro_started_at: null }),
        );
      }
    } else {
      subRows = (subData ?? []) as ReferredSubscriptionRow[];
    }

    const { funnel, events } = deriveReferredSignups(profileRows, subRows);

    return NextResponse.json({ migrationPending, funnel, events });
  } catch (err) {
    console.error("referred-signups error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
