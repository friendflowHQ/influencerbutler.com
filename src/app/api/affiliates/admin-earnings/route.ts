import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { computeMonthlyEarnings } from "@/lib/affiliate-commissions-data";
import { listStoreAffiliates } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly affiliate earnings for the admin Analytics tab. Returns, per trailing
 * month, the aggregate and per-affiliate breakdown of gross referred revenue,
 * LS's 30% share, our top-up owed, and full affiliate earnings. Computed from
 * our own orders (reconciles with the Payouts tab). Also returns the LS
 * cumulative earnings total as a sanity figure.
 *
 * GET ?months=12 (1..24, default 12).
 */

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawMonths = Number(url.searchParams.get("months"));
  const months = Number.isFinite(rawMonths) ? Math.min(24, Math.max(1, Math.round(rawMonths))) : 12;

  const now = new Date();
  const result = await computeMonthlyEarnings({
    months,
    endYear: now.getUTCFullYear(),
    endMonth1: now.getUTCMonth() + 1,
  });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Lemon Squeezy cumulative earnings, as a program-level cross-check figure.
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  let lsTotalEarningsCents: number | null = null;
  if (storeId) {
    try {
      const storeAffiliates = await listStoreAffiliates(storeId);
      if (storeAffiliates.length > 0) {
        lsTotalEarningsCents = storeAffiliates.reduce((s, a) => s + a.totalEarningsCents, 0);
      }
    } catch (error) {
      console.error("admin-earnings: LS list threw", error);
    }
  }

  return NextResponse.json({
    admin: { email: actor.email },
    months: result.months,
    totals: result.totals,
    byAffiliate: result.byAffiliate,
    lsTotalEarningsCents,
  });
}
