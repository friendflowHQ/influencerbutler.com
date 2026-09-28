import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAnnualVariantForMonthly } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight "is this user on a monthly plan they could switch to annual?"
 * check for the dashboard-wide SwitchToAnnualBanner. Deliberately cheaper than
 * /api/me/subscription-details (no license-key resolution, no Lemon Squeezy
 * fallback): a single indexed subscriptions read, then the same
 * resolveAnnualVariantForMonthly test the subscription page uses.
 *
 * The banner only nudges; the actual (billing-sensitive) swap still happens on
 * the subscription page via /api/subscription/upgrade. Reads with the admin
 * client because the subscriptions table has RLS on with no SELECT policy.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ eligible: false }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: subs, error } = await admin
      .from("subscriptions")
      .select("ls_variant_id,status")
      .eq("user_id", userData.user.id)
      .in("status", ["active", "on_trial"]);

    if (error) {
      console.error("annual-offer: subscriptions read failed", error);
      return NextResponse.json({ eligible: false });
    }

    const rows = (subs ?? []) as { ls_variant_id: string | number | null; status: string | null }[];
    const eligible = rows.some(
      (r) => resolveAnnualVariantForMonthly(r.ls_variant_id) != null,
    );
    return NextResponse.json({ eligible });
  } catch (err) {
    console.error("annual-offer threw", err);
    return NextResponse.json({ eligible: false });
  }
}
