import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { referralProgramEnabled, getReferralStats } from "@/lib/referral-program";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals/me
 *
 * The signed-in user's consumer-referral card data: their invite link and their
 * stats. Returns { enabled: false } when the program is off so the dashboard
 * card can render nothing without special-casing.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  if (!referralProgramEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const admin = createAdminClient();
  const stats = await getReferralStats(
    admin,
    userData.user.id,
    userData.user.email ?? null,
    userData.user.email ?? null,
  );

  return NextResponse.json({ enabled: true, ...stats });
}
