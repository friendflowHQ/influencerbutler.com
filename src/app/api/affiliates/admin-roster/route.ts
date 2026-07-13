import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { listStoreAffiliates, type StoreAffiliate } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only affiliate roster for the admin dashboard. Merges three sources into
 * one row per user:
 *
 *  - affiliate_applications: name, email, application status, applied date.
 *  - profiles: branded code, is_affiliate flag, ls_affiliate_id link state.
 *  - Lemon Squeezy (store-wide list): earnings for linked affiliates.
 *
 * Earnings come straight from the LS affiliates list, so the whole roster needs
 * just one paginated LS call (no per-affiliate fetch). LS has no exact
 * "last paid" date, so we surface paid-to-date (total minus unpaid) instead.
 */

type AppStatus = "pending" | "approved" | "rejected" | "none";

type RosterRow = {
  userId: string;
  name: string | null;
  email: string | null;
  affiliateCode: string | null;
  appStatus: AppStatus;
  isAffiliate: boolean;
  lsLinked: boolean;
  lsStatus: string | null;
  totalEarningsCents: number | null;
  paidCents: number | null;
  unpaidEarningsCents: number | null;
  appliedAt: string | null;
  reviewedAt: string | null;
  commissionPercent: number | null;
  commissionDurationMonths: number | null;
  affiliateCompMonthlyQuota: number | null;
  lsActivatedAt: string | null;
};

type RosterClient = {
  from: (table: string) => {
    select: (cols: string) => Promise<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  };
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeStatus(value: unknown): AppStatus {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return "none";
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as RosterClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { data: apps, error: appsErr } = await supabase
      .from("affiliate_applications")
      .select("user_id,full_name,email,status,created_at,reviewed_at");

    if (appsErr) {
      console.error("admin-roster: applications query failed", appsErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select(
        "id,email,is_affiliate,affiliate_code,ls_affiliate_id,commission_percent,commission_duration_months,ls_activated_at",
      );

    if (profilesErr) {
      console.error("admin-roster: profiles query failed", profilesErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Index profiles by user id so each roster row can pick up the branded code
    // and LS link state.
    type ProfileInfo = {
      email: string | null;
      isAffiliate: boolean;
      affiliateCode: string | null;
      lsAffiliateId: string | null;
      commissionPercent: number | null;
      commissionDurationMonths: number | null;
      affiliateCompMonthlyQuota: number | null;
      lsActivatedAt: string | null;
    };
    const profileByUser = new Map<string, ProfileInfo>();
    for (const row of profiles ?? []) {
      const userId = str(row.id);
      if (!userId) continue;
      profileByUser.set(userId, {
        email: str(row.email),
        isAffiliate: row.is_affiliate === true,
        affiliateCode: str(row.affiliate_code),
        lsAffiliateId: str(row.ls_affiliate_id),
        commissionPercent:
          typeof row.commission_percent === "number" ? row.commission_percent : null,
        commissionDurationMonths:
          typeof row.commission_duration_months === "number"
            ? row.commission_duration_months
            : null,
        affiliateCompMonthlyQuota: null,
        lsActivatedAt: str(row.ls_activated_at),
      });
    }

    // Comp allowance is read separately + wrapped so a not-yet-migrated
    // affiliate_comp_monthly_quota column degrades to "no quotas" instead of
    // 500ing the whole roster (prod schema is applied by hand and drifts).
    try {
      const { data: quotas } = await supabase
        .from("profiles")
        .select("id,affiliate_comp_monthly_quota");
      for (const row of quotas ?? []) {
        const userId = str(row.id);
        if (!userId) continue;
        const existing = profileByUser.get(userId);
        if (existing && typeof row.affiliate_comp_monthly_quota === "number") {
          existing.affiliateCompMonthlyQuota = row.affiliate_comp_monthly_quota;
        }
      }
    } catch (err) {
      console.warn("admin-roster: comp allowance read skipped", err);
    }

    // LS earnings, keyed by affiliate id. Degrade gracefully: if LS is down we
    // still return the roster with earnings marked unavailable (null).
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    let lsById = new Map<string, StoreAffiliate>();
    let lsAvailable = false;
    if (storeId) {
      try {
        const storeAffiliates = await listStoreAffiliates(storeId);
        lsAvailable = storeAffiliates.length > 0;
        lsById = new Map(storeAffiliates.map((a) => [a.id, a]));
      } catch (error) {
        console.error("admin-roster: LS list threw", error);
      }
    } else {
      console.error("admin-roster: LEMONSQUEEZY_STORE_ID missing");
    }

    const buildEarnings = (lsAffiliateId: string | null) => {
      if (!lsAffiliateId || !lsAvailable) {
        return { totalEarningsCents: null, paidCents: null, unpaidEarningsCents: null };
      }
      const ls = lsById.get(lsAffiliateId);
      if (!ls) {
        return { totalEarningsCents: null, paidCents: null, unpaidEarningsCents: null };
      }
      const total = ls.totalEarningsCents;
      const unpaid = ls.unpaidEarningsCents;
      return {
        totalEarningsCents: total,
        unpaidEarningsCents: unpaid,
        paidCents: Math.max(0, total - unpaid),
      };
    };

    const rows: RosterRow[] = [];
    const seen = new Set<string>();

    // Start from applications (covers pending/approved/rejected applicants).
    for (const row of apps ?? []) {
      const userId = str(row.user_id);
      if (!userId) continue;
      seen.add(userId);
      const profile = profileByUser.get(userId);
      const lsAffiliateId = profile?.lsAffiliateId ?? null;
      const earnings = buildEarnings(lsAffiliateId);
      rows.push({
        userId,
        name: str(row.full_name) ?? (lsAffiliateId ? lsById.get(lsAffiliateId)?.name ?? null : null),
        email: str(row.email) ?? profile?.email ?? null,
        affiliateCode: profile?.affiliateCode ?? null,
        appStatus: normalizeStatus(row.status),
        isAffiliate: profile?.isAffiliate ?? false,
        lsLinked: Boolean(lsAffiliateId),
        lsStatus: lsAffiliateId ? lsById.get(lsAffiliateId)?.status ?? null : null,
        appliedAt: str(row.created_at),
        reviewedAt: str(row.reviewed_at),
        commissionPercent: profile?.commissionPercent ?? null,
        commissionDurationMonths: profile?.commissionDurationMonths ?? null,
        affiliateCompMonthlyQuota: profile?.affiliateCompMonthlyQuota ?? null,
        lsActivatedAt: profile?.lsActivatedAt ?? null,
        ...earnings,
      });
    }

    // Include approved affiliates that have no application row (edge case:
    // manually flagged is_affiliate or approved before applications existed).
    for (const [userId, profile] of profileByUser) {
      if (seen.has(userId)) continue;
      if (!profile.isAffiliate && !profile.affiliateCode) continue;
      const earnings = buildEarnings(profile.lsAffiliateId);
      rows.push({
        userId,
        name: profile.lsAffiliateId ? lsById.get(profile.lsAffiliateId)?.name ?? null : null,
        email: profile.email,
        affiliateCode: profile.affiliateCode,
        appStatus: "none",
        isAffiliate: profile.isAffiliate,
        lsLinked: Boolean(profile.lsAffiliateId),
        lsStatus: profile.lsAffiliateId ? lsById.get(profile.lsAffiliateId)?.status ?? null : null,
        appliedAt: null,
        reviewedAt: null,
        commissionPercent: profile.commissionPercent,
        commissionDurationMonths: profile.commissionDurationMonths,
        affiliateCompMonthlyQuota: profile.affiliateCompMonthlyQuota,
        lsActivatedAt: profile.lsActivatedAt,
        ...earnings,
      });
    }

    // Highest earners first, then most recent applicants.
    rows.sort((a, b) => {
      const ae = a.totalEarningsCents ?? -1;
      const be = b.totalEarningsCents ?? -1;
      if (ae !== be) return be - ae;
      const at = a.appliedAt ?? "";
      const bt = b.appliedAt ?? "";
      return at < bt ? 1 : at > bt ? -1 : 0;
    });

    return NextResponse.json({
      admin: { email: actor.email },
      lsAvailable,
      affiliates: rows,
    });
  } catch (error) {
    console.error("admin-roster failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
