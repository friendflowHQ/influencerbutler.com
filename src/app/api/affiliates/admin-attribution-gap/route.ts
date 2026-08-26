/**
 * GET/POST /api/affiliates/admin-attribution-gap
 *
 * The attribution gap: a referred customer's SIGNUP is attributed to an affiliate
 * (first-touch, stored on profiles.ref_affiliate_user_id, with subscriptions as a
 * secondary source), but the customer's paid ORDER was never stamped with that
 * affiliate (orders.ref_affiliate_user_id is null). Such conversions show in the
 * affiliate's referred-signups funnel yet are invisible to the Owed tab and the
 * PayPal disburse path, which only read stamped orders. So the affiliate is
 * silently under-paid.
 *
 *  GET  -> per active affiliate, the paid unreconciled orders whose buyer they
 *          referred but which carry no order-level attribution, plus the
 *          commission that would be owed once attributed (full promised rate).
 *  POST -> stamp those gap orders (ref_affiliate_user_id / ref_affiliate_code /
 *          attribution_status='pending') for one affiliate or all of them, after
 *          which they flow into the Owed tab automatically. Body:
 *            { userId: "<affiliate user id>" }  attribute that affiliate's gap
 *            { all: true }                       attribute every detected gap
 *
 * Attribution is admin-reviewed (it commits us to pay), so this never runs
 * automatically. The gap is recomputed server-side on POST so the client cannot
 * widen what gets stamped.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { resolveRatePercent } from "@/lib/affiliate-commissions";
import { attributeOrdersToAffiliate } from "@/lib/affiliate-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SelectClient = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

type GapOrder = {
  lsOrderId: string;
  totalCents: number;
  currency: string | null;
  createdAt: string | null;
};

type GapAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  ratePercent: number;
  orderCount: number;
  grossCents: number;
  owedCents: number;
  orders: GapOrder[];
};

type ActiveAffiliate = {
  email: string | null;
  affiliateCode: string | null;
  ratePercent: number;
};

/**
 * Recompute the attribution gap grouped by affiliate. Pure-ish: reads Supabase
 * but performs no writes, so GET and POST share one definition of "the gap".
 * Best-effort on the referral columns (profiles/subscriptions attribution lives
 * on manually-applied migrations that can lag prod): a read error degrades that
 * source to empty rather than 500ing.
 */
async function computeAttributionGap(supabase: SelectClient): Promise<GapAffiliate[]> {
  // Active affiliates + their promised rate. is_affiliate is filtered in JS to
  // avoid depending on the thin client's chaining.
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id,email,affiliate_code,is_affiliate,commission_percent,commission_duration_months");
  if (profilesErr) {
    console.error("admin-attribution-gap: profiles query failed", profilesErr);
    throw new Error("profiles query failed");
  }

  const activeByUser = new Map<string, ActiveAffiliate>();
  for (const row of profiles ?? []) {
    const userId = str(row.id);
    if (!userId || row.is_affiliate !== true) continue;
    activeByUser.set(userId, {
      email: str(row.email),
      affiliateCode: str(row.affiliate_code),
      ratePercent: resolveRatePercent({
        commissionPercent:
          typeof row.commission_percent === "number" ? row.commission_percent : null,
        commissionDurationMonths:
          typeof row.commission_duration_months === "number"
            ? row.commission_duration_months
            : null,
      }),
    });
  }

  // Who referred each buyer, first-touch from profiles (preferred).
  const referrerByBuyer = new Map<string, string>();
  try {
    const { data: refProfiles, error } = await supabase
      .from("profiles")
      .select("id,ref_affiliate_user_id");
    if (error) throw error;
    for (const row of refProfiles ?? []) {
      const buyerId = str(row.id);
      const affId = str(row.ref_affiliate_user_id);
      if (buyerId && affId) referrerByBuyer.set(buyerId, affId);
    }
  } catch (err) {
    console.warn("admin-attribution-gap: profiles referral read skipped", err);
  }

  // Secondary source: subscription-level attribution, only for buyers not already
  // mapped by their first-touch profile attribution.
  try {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("user_id,ref_affiliate_user_id");
    if (error) throw error;
    for (const row of subs ?? []) {
      const buyerId = str(row.user_id);
      const affId = str(row.ref_affiliate_user_id);
      if (buyerId && affId && !referrerByBuyer.has(buyerId)) {
        referrerByBuyer.set(buyerId, affId);
      }
    }
  } catch (err) {
    console.warn("admin-attribution-gap: subscription referral read skipped", err);
  }

  // Display names.
  const { data: apps } = await supabase
    .from("affiliate_applications")
    .select("user_id,full_name");
  const nameByUser = new Map<string, string | null>();
  for (const row of apps ?? []) {
    const userId = str(row.user_id);
    if (userId) nameByUser.set(userId, str(row.full_name));
  }

  // Paid, unreconciled, UN-attributed orders whose buyer we can trace back to an
  // active affiliate are the gap.
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "ls_order_id,user_id,total,currency,status,attribution_status,reconciled_at,ref_affiliate_user_id,created_at",
    );
  if (ordersErr) {
    console.error("admin-attribution-gap: orders query failed", ordersErr);
    throw new Error("orders query failed");
  }

  const byAffiliate = new Map<string, GapAffiliate>();
  for (const row of orders ?? []) {
    if (str(row.status) !== "paid") continue;
    if (str(row.reconciled_at)) continue;
    if (str(row.ref_affiliate_user_id)) continue; // already attributed, not a gap
    const lsOrderId = str(row.ls_order_id);
    const buyerId = str(row.user_id);
    if (!lsOrderId || !buyerId) continue;

    const affUserId = referrerByBuyer.get(buyerId);
    if (!affUserId) continue; // buyer was not referred by anyone
    const active = activeByUser.get(affUserId);
    if (!active) continue; // referrer is not an active affiliate

    const totalCents = typeof row.total === "number" ? row.total : 0;
    let entry = byAffiliate.get(affUserId);
    if (!entry) {
      entry = {
        userId: affUserId,
        email: active.email,
        fullName: nameByUser.get(affUserId) ?? null,
        affiliateCode: active.affiliateCode,
        ratePercent: active.ratePercent,
        orderCount: 0,
        grossCents: 0,
        owedCents: 0,
        orders: [],
      };
      byAffiliate.set(affUserId, entry);
    }
    entry.orderCount += 1;
    entry.grossCents += totalCents;
    entry.orders.push({
      lsOrderId,
      totalCents,
      currency: str(row.currency),
      createdAt: str(row.created_at),
    });
  }

  const result = [...byAffiliate.values()].map((a) => ({
    ...a,
    owedCents: Math.round((a.grossCents * a.ratePercent) / 100),
  }));
  result.sort((x, y) => y.owedCents - x.owedCents);
  return result;
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as SelectClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const affiliates = await computeAttributionGap(supabase);
    return NextResponse.json({
      admin: { email: actor.email },
      verifyBeforePaying: true,
      affiliates,
    });
  } catch (error) {
    console.error("admin-attribution-gap GET failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

type ApplyBody = {
  userId?: string;
  all?: boolean;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetUserId = str(body.userId);
  const applyAll = body.all === true;
  if (!targetUserId && !applyAll) {
    return NextResponse.json(
      { error: "Provide an affiliate userId, or all:true to attribute every gap." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let gap: GapAffiliate[];
  try {
    gap = await computeAttributionGap(adminClient as unknown as SelectClient);
  } catch (error) {
    console.error("admin-attribution-gap POST: gap recompute failed", error);
    return NextResponse.json({ error: "Could not recompute the gap" }, { status: 500 });
  }

  const targets = applyAll ? gap : gap.filter((a) => a.userId === targetUserId);
  if (targets.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No attribution-gap orders found for that selection." },
      { status: 404 },
    );
  }

  const allStamped: string[] = [];
  const allSkipped: { orderId: string; reason: string }[] = [];
  const perAffiliate: { userId: string; stampedCount: number }[] = [];

  // Gap orders are un-attributed by definition, so force is irrelevant here.
  for (const aff of targets) {
    const { stamped, skipped } = await attributeOrdersToAffiliate(
      adminClient,
      { userId: aff.userId, code: aff.affiliateCode },
      aff.orders.map((o) => ({ ls_order_id: o.lsOrderId, ref_affiliate_user_id: null })),
      false,
    );
    allStamped.push(...stamped);
    allSkipped.push(...skipped);
    perAffiliate.push({ userId: aff.userId, stampedCount: stamped.length });
  }

  await logAdminAction({
    actor,
    action: "affiliate.gap.reconcile",
    targetType: targetUserId ? "user" : "system",
    targetId: targetUserId ?? "all",
    details: { applyAll, perAffiliate, stampedCount: allStamped.length, skipped: allSkipped },
  });

  return NextResponse.json({
    ok: allStamped.length > 0,
    stampedCount: allStamped.length,
    stamped: allStamped,
    skipped: allSkipped,
  });
}
