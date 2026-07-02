import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDiscountState } from "@/lib/lemonsqueezy-discounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/discount-codes
 *
 * The signed-in user's unredeemed personal discount codes (the trial codes
 * minted onto their subscription row by the webhook / affiliate-funnel cron).
 * Each code is verified live against Lemon Squeezy: deleted, redeemed, or
 * expired codes are filtered out. When LS is unreachable, the code is still
 * returned with a locally derived expiry - a stale code fails harmlessly at
 * checkout, which beats hiding a real offer.
 *
 * Degrades to { codes: [] } when the 20260419_trial_funnel columns are not in
 * prod yet (schema is migrated manually and can lag).
 */

type TrialCodeRow = {
  status?: string | null;
  renews_at?: string | null;
  trial_started_at?: string | null;
  trial_discount_code_monthly?: string | null;
  trial_discount_code_annual?: string | null;
  ls_discount_id_monthly?: string | null;
  ls_discount_id_annual?: string | null;
};

type UserCode = {
  code: string;
  plan: "monthly" | "annual";
  percent: number | null;
  expiresAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local guess at when the trial codes stop being useful: trial end + 1 day. */
function fallbackExpiry(row: TrialCodeRow): string | null {
  if (row.status === "on_trial" && row.renews_at) {
    return new Date(new Date(row.renews_at).getTime() + DAY_MS).toISOString();
  }
  if (row.trial_started_at) {
    return new Date(new Date(row.trial_started_at).getTime() + 4 * DAY_MS).toISOString();
  }
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  let row: TrialCodeRow | null = null;
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select(
        "status,renews_at,trial_started_at,trial_discount_code_monthly,trial_discount_code_annual,ls_discount_id_monthly,ls_discount_id_annual",
      )
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      // Most likely 42703: trial columns not applied in prod yet.
      console.error("discount-codes: subscription read failed", error);
      return NextResponse.json({ codes: [] });
    }
    row = data && data.length > 0 ? (data[0] as TrialCodeRow) : null;
  } catch (err) {
    console.error("discount-codes: subscription read threw", err);
    return NextResponse.json({ codes: [] });
  }

  if (!row) return NextResponse.json({ codes: [] });

  // Cheap pre-filter: long-converted or long-cancelled subscribers have no
  // live trial codes, so skip the LS round-trips for the common case.
  const localExpiry = fallbackExpiry(row);
  const windowOpen =
    row.status === "on_trial" ||
    (localExpiry !== null && new Date(localExpiry).getTime() > Date.now());
  if (!windowOpen) return NextResponse.json({ codes: [] });

  const candidates: { code: string; discountId: string | null; plan: "monthly" | "annual" }[] = [];
  if (row.trial_discount_code_monthly) {
    candidates.push({
      code: row.trial_discount_code_monthly,
      discountId: row.ls_discount_id_monthly ?? null,
      plan: "monthly",
    });
  }
  if (row.trial_discount_code_annual) {
    candidates.push({
      code: row.trial_discount_code_annual,
      discountId: row.ls_discount_id_annual ?? null,
      plan: "annual",
    });
  }
  if (candidates.length === 0) return NextResponse.json({ codes: [] });

  const codes = (
    await Promise.all(
      candidates.map(async (candidate): Promise<UserCode | null> => {
        if (!candidate.discountId) {
          return { code: candidate.code, plan: candidate.plan, percent: null, expiresAt: localExpiry };
        }
        const state = await fetchDiscountState(candidate.discountId);
        if (state === null) {
          // LS unreachable: show with the locally derived expiry.
          return { code: candidate.code, plan: candidate.plan, percent: null, expiresAt: localExpiry };
        }
        if (!state.exists || state.redeemed) return null;
        const expiresAt = state.expiresAt ?? localExpiry;
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;
        return {
          code: candidate.code,
          plan: candidate.plan,
          percent: state.percent,
          expiresAt,
        };
      }),
    )
  ).filter((c): c is UserCode => c !== null);

  return NextResponse.json({ codes });
}
