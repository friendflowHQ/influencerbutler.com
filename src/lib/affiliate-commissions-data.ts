// Data layer for the affiliate commission engine.
//
// Loads per-affiliate terms + orders from Supabase and runs them through the
// pure engine in affiliate-commissions.ts. Shared by the Payouts API route and
// the monthly statement cron so the query logic lives in exactly one place.

import { createAdminClient } from "@/lib/admin";
import {
  computeAffiliateOwed,
  orderInPeriod,
  periodBounds,
  resolveRatePercent,
  type AffiliateTerms,
  type CommissionOrder,
  type CommissionLine,
} from "@/lib/affiliate-commissions";

/** One affiliate's monthly commission summary, ready for UI or email. */
export type AffiliateStatement = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  lsAffiliateId: string | null;
  ratePercent: number;
  durationMonths: number | null;
  orderCount: number;
  grossCents: number;
  lsPaidCents: number;
  owedCents: number;
  lines: CommissionLine[];
};

export type CommissionLoadResult = {
  statements: AffiliateStatement[];
  /** True for periods where any affiliate had a custom (non-30) rate. */
  hasCustomRates: boolean;
};

type LoadClient = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function intOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Builds per-affiliate commission statements. Options:
 *  - period 'YYYY-MM': restrict owed lines to orders created that month. Omit
 *    for all-time.
 *  - userIds: restrict to these affiliate user ids.
 *  - onlyOwed: drop affiliates whose owed total is 0 (used by the cron and the
 *    default Payouts view so we don't email empty statements).
 *  - customRatesOnly: drop affiliates on the default 30% rate (they need no
 *    top-up at all).
 */
export async function loadAffiliateCommissions(opts: {
  period?: string;
  userIds?: string[];
  onlyOwed?: boolean;
  customRatesOnly?: boolean;
}): Promise<CommissionLoadResult | null> {
  const supabase = createAdminClient() as unknown as LoadClient | null;
  if (!supabase) return null;

  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select(
      "id,email,affiliate_code,ls_affiliate_id,is_affiliate,commission_percent,commission_duration_months",
    );
  if (profilesErr) {
    console.error("loadAffiliateCommissions: profiles query failed", profilesErr);
    return null;
  }

  const { data: apps } = await supabase
    .from("affiliate_applications")
    .select("user_id,full_name");
  const nameByUser = new Map<string, string | null>();
  for (const row of apps ?? []) {
    const uid = str(row.user_id);
    if (uid) nameByUser.set(uid, str(row.full_name));
  }

  const { data: rawOrders, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "ls_order_id,user_id,total,currency,status,attribution_status,reconciled_at,ref_affiliate_user_id,created_at",
    );
  if (ordersErr) {
    console.error("loadAffiliateCommissions: orders query failed", ordersErr);
    return null;
  }

  // Normalize orders once. Keep the referring affiliate on each row so we can
  // group, but build the full set too (unfiltered) for per-buyer window anchors.
  const allOrders: CommissionOrder[] = [];
  const ordersByAffiliate = new Map<string, CommissionOrder[]>();
  const bounds = opts.period ? periodBounds(opts.period) : null;
  for (const row of rawOrders ?? []) {
    const lsOrderId = str(row.ls_order_id);
    if (!lsOrderId) continue;
    const co: CommissionOrder = {
      lsOrderId,
      buyerUserId: str(row.user_id),
      totalCents: typeof row.total === "number" ? row.total : 0,
      currency: str(row.currency),
      status: str(row.status),
      attributionStatus: str(row.attribution_status),
      reconciledAt: str(row.reconciled_at),
      createdAt: str(row.created_at),
    };
    allOrders.push(co);

    const affUserId = str(row.ref_affiliate_user_id);
    if (!affUserId) continue;
    // Period filter applies to which orders count toward this statement, not to
    // the anchor set (allOrders stays complete so window math is accurate).
    if (bounds && !orderInPeriod(co, bounds)) continue;
    const list = ordersByAffiliate.get(affUserId);
    if (list) list.push(co);
    else ordersByAffiliate.set(affUserId, [co]);
  }

  const wantUsers = opts.userIds ? new Set(opts.userIds) : null;
  const statements: AffiliateStatement[] = [];
  let hasCustomRates = false;

  for (const row of profiles ?? []) {
    const userId = str(row.id);
    if (!userId) continue;
    if (wantUsers && !wantUsers.has(userId)) continue;

    const terms: AffiliateTerms = {
      commissionPercent: intOrNull(row.commission_percent),
      commissionDurationMonths: intOrNull(row.commission_duration_months),
    };
    const ratePercent = resolveRatePercent(terms);
    const isCustom = ratePercent !== 30;
    if (isCustom) hasCustomRates = true;

    // Only affiliates (or anyone with a custom rate) are relevant.
    const isAffiliate = row.is_affiliate === true;
    if (!isAffiliate && !isCustom) continue;
    if (opts.customRatesOnly && !isCustom) continue;

    const affOrders = ordersByAffiliate.get(userId) ?? [];
    const owed = computeAffiliateOwed(terms, affOrders, allOrders);
    if (opts.onlyOwed && owed.owedCents <= 0) continue;

    statements.push({
      userId,
      email: str(row.email),
      fullName: nameByUser.get(userId) ?? null,
      affiliateCode: str(row.affiliate_code),
      lsAffiliateId: str(row.ls_affiliate_id),
      ratePercent: owed.ratePercent,
      durationMonths: owed.durationMonths,
      orderCount: owed.orderCount,
      grossCents: owed.grossCents,
      lsPaidCents: owed.lsPaidCents,
      owedCents: owed.owedCents,
      lines: owed.lines,
    });
  }

  statements.sort((a, b) => b.owedCents - a.owedCents);
  return { statements, hasCustomRates };
}
