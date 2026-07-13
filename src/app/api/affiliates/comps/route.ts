import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import {
  normalizeAffiliateCompDuration,
  compQuotaState,
  monthStartIso,
  AFFILIATE_COMP_PLAN,
  AFFILIATE_COMP_SEATS,
  AFFILIATE_COMP_MAX_DAYS,
  AFFILIATE_COMP_MAX_MONTHS,
} from "@/lib/affiliate-comps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate "comp workspace": a trusted ("main squeeze") affiliate hands out a
 * limited free Pro workspace to a prospect, for wiggle room to convert them.
 *
 *  GET  -> their allowance state (enabled / quota / used this month) plus the
 *          comps they have already issued, for the dashboard card.
 *  POST -> issue one comp. Hard guardrails, enforced here regardless of input:
 *          single-seat Solo Pro, 2-month / 60-day maximum window, no stacking on
 *          an account that already has access, and never more than the admin-set
 *          monthly quota. The prospect is emailed the key + the affiliate's
 *          branded checkout link so a later upgrade credits the affiliate.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type IssuedGrant = {
  recipientEmail: string | null;
  code: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  state: "active" | "expiring" | "expired" | "cancelled";
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function grantState(expiresAt: string | null, cancelledAt: string | null, now: number): {
  daysRemaining: number | null;
  state: IssuedGrant["state"];
} {
  if (cancelledAt) return { daysRemaining: null, state: "cancelled" };
  if (!expiresAt) return { daysRemaining: null, state: "active" };
  const days = Math.floor((new Date(expiresAt).getTime() - now) / (24 * 60 * 60 * 1000));
  if (days <= 0) return { daysRemaining: days, state: "expired" };
  if (days <= 7) return { daysRemaining: days, state: "expiring" };
  return { daysRemaining: days, state: "active" };
}

/** Resolve the current affiliate and their comp allowance. Shared by GET/POST. */
async function resolveAffiliate() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const user = userData.user;
  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_affiliate,affiliate_code,display_name,affiliate_comp_monthly_quota,affiliate_comp_updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("affiliates/comps: profile query failed", profileErr);
    return { error: NextResponse.json({ error: "Could not load affiliate" }, { status: 500 }) };
  }
  if (!profile || profile.is_affiliate !== true) {
    return { error: NextResponse.json({ error: "Not an affiliate" }, { status: 403 }) };
  }

  const quota =
    typeof profile.affiliate_comp_monthly_quota === "number"
      ? profile.affiliate_comp_monthly_quota
      : null;

  return {
    user,
    admin,
    affiliateCode: str(profile.affiliate_code),
    displayName: str(profile.display_name),
    quota,
    updatedAt: str(profile.affiliate_comp_updated_at),
  };
}

async function countIssuedThisMonth(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("comp_grants")
    .select("id", { count: "exact", head: true })
    .eq("issued_by_affiliate_id", userId)
    .gte("issued_at", monthStartIso());
  if (error) {
    console.error("affiliates/comps: count query failed", error);
    return 0;
  }
  return count ?? 0;
}

export async function GET() {
  try {
    const ctx = await resolveAffiliate();
    if ("error" in ctx) return ctx.error;
    const { user, admin, quota, updatedAt } = ctx;

    const usedThisMonth = await countIssuedThisMonth(admin, user.id);
    const quotaState = compQuotaState(quota, usedThisMonth);

    const now = Date.now();
    let grants: IssuedGrant[] = [];
    const { data: rows, error } = await admin
      .from("comp_grants")
      .select("user_email,discount_code,issued_at,expires_at,cancelled_at")
      .eq("issued_by_affiliate_id", user.id)
      .order("issued_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("affiliates/comps: grants read skipped", error);
    } else {
      grants = (rows ?? []).map((r) => {
        const expiresAt = str(r.expires_at);
        const cancelledAt = str(r.cancelled_at);
        const { daysRemaining, state } = grantState(expiresAt, cancelledAt, now);
        return {
          recipientEmail: str(r.user_email),
          code: str(r.discount_code),
          issuedAt: str(r.issued_at),
          expiresAt,
          daysRemaining,
          state,
        };
      });
    }

    return NextResponse.json({
      enabled: quotaState.enabled,
      quota: quotaState.quota,
      usedThisMonth: quotaState.usedThisMonth,
      remaining: quotaState.remaining,
      maxDays: AFFILIATE_COMP_MAX_DAYS,
      maxMonths: AFFILIATE_COMP_MAX_MONTHS,
      updatedAt,
      grants,
    });
  } catch (err) {
    console.error("affiliates/comps GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PostBody = {
  recipientEmail?: string;
  recipientName?: string;
  unit?: string;
  amount?: number | string;
};

export async function POST(request: Request) {
  try {
    const ctx = await resolveAffiliate();
    if ("error" in ctx) return ctx.error;
    const { user, admin, affiliateCode, displayName, quota } = ctx;

    // Must be enabled by an admin (a positive monthly quota).
    const enabledState = compQuotaState(quota, 0);
    if (!enabledState.enabled) {
      return NextResponse.json(
        { error: "Your account is not set up to hand out comps. Contact us to enable it." },
        { status: 403 },
      );
    }

    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const recipientEmail = (body.recipientEmail ?? "").trim();
    if (!EMAIL_RE.test(recipientEmail)) {
      return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
    const recipientName = typeof body.recipientName === "string" && body.recipientName.trim()
      ? body.recipientName.trim()
      : null;

    const duration = normalizeAffiliateCompDuration({ unit: body.unit, amount: body.amount });
    if (!duration.ok) {
      return NextResponse.json({ error: duration.error }, { status: 400 });
    }

    // Enforce the monthly quota (recount at commit time to shrink the race window).
    const usedThisMonth = await countIssuedThisMonth(admin, user.id);
    const quotaState = compQuotaState(quota, usedThisMonth);
    if (quotaState.remaining <= 0) {
      return NextResponse.json(
        {
          error: `You have used all ${quotaState.quota} of this month's comps. Your allowance resets on the 1st.`,
        },
        { status: 429 },
      );
    }

    // Branded checkout link so a later upgrade is attributed to this affiliate.
    const siteUrl = (
      process.env.SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://www.influencerbutler.com"
    ).replace(/\/$/, "");
    const convertLink = affiliateCode
      ? `${siteUrl}/pricing?code=${encodeURIComponent(affiliateCode)}`
      : null;

    const result = await issueInHouseComp({
      email: recipientEmail,
      name: recipientName,
      months: duration.months,
      days: duration.days,
      plan: AFFILIATE_COMP_PLAN,
      seats: AFFILIATE_COMP_SEATS,
      forever: false,
      allowExisting: false,
      convertLink,
      issuerName: displayName,
      issuedByAffiliateId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      recipientEmail: result.email,
      expiresAt: result.expiresAt,
      remaining: Math.max(0, quotaState.remaining - 1),
    });
  } catch (err) {
    console.error("affiliates/comps POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
