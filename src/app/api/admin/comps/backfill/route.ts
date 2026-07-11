/**
 * POST /api/admin/comps/backfill   (add ?dry=1 to preview without writing)
 *
 * Reconstructs comps that were issued before the discount-capture webhook
 * shipped (so their discount data never landed in our orders table and they are
 * invisible on the Comps page). Walks Lemon Squeezy's comp-like discounts and
 * their redemptions, maps each redeemed LS order to our local subscription, and
 * upserts a comp_grants row (source 'lemonsqueezy') for any not already tracked.
 *
 * Idempotent: subscriptions that already have a comp_grants row are skipped, so
 * re-running never duplicates or clobbers markers. Gated on licenses.view.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { listCompLikeDiscounts, listDiscountRedemptions } from "@/lib/lemonsqueezy";
import { parseCompMonths } from "@/lib/comp-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REDEMPTIONS = 5000; // safety bound on a rarely-run maintenance job
const CHUNK = 200; // Supabase .in() batch size

type Candidate = {
  lsSubscriptionId: string;
  userId: string;
  userEmail: string | null;
  discountCode: string | null;
  months: number | null;
  issuedAt: string | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const svc = adminService();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // 1) Collect comp-like discount redemptions from LS.
  const discounts = await listCompLikeDiscounts();
  type Red = { lsOrderId: string; discountCode: string | null; createdAt: string | null };
  const redemptions: Red[] = [];
  let capped = false;
  for (const d of discounts) {
    const reds = await listDiscountRedemptions(d.id);
    for (const r of reds) {
      if (!r.lsOrderId) continue;
      if (redemptions.length >= MAX_REDEMPTIONS) {
        capped = true;
        break;
      }
      redemptions.push({
        lsOrderId: r.lsOrderId,
        discountCode: r.discountCode ?? d.code,
        createdAt: r.createdAt,
      });
    }
    if (capped) break;
  }

  // 2) Map LS order id -> our order (user_id, ls_subscription_id).
  const orderIds = [...new Set(redemptions.map((r) => r.lsOrderId))];
  const orderByLsId = new Map<string, { userId: string | null; lsSubId: string | null }>();
  for (const ids of chunk(orderIds, CHUNK)) {
    const res = await svc.from("orders").select("ls_order_id,user_id,ls_subscription_id").in("ls_order_id", ids);
    for (const row of res.data ?? []) {
      const lsOrderId = str(row.ls_order_id);
      if (lsOrderId) {
        orderByLsId.set(lsOrderId, { userId: str(row.user_id), lsSubId: str(row.ls_subscription_id) });
      }
    }
  }

  // 3) For orders missing a subscription id, fall back to the user's earliest
  //    subscription.
  const usersNeedingSub = new Set<string>();
  for (const o of orderByLsId.values()) {
    if (o.userId && !o.lsSubId) usersNeedingSub.add(o.userId);
  }
  const subByUser = new Map<string, string>();
  if (usersNeedingSub.size > 0) {
    for (const ids of chunk([...usersNeedingSub], CHUNK)) {
      const res = await svc
        .from("subscriptions")
        .select("user_id,ls_subscription_id,created_at")
        .in("user_id", ids)
        .order("created_at", { ascending: true });
      for (const row of res.data ?? []) {
        const uid = str(row.user_id);
        const sid = str(row.ls_subscription_id);
        if (uid && sid && !subByUser.has(uid)) subByUser.set(uid, sid);
      }
    }
  }

  // 4) Existing comp_grants (skip these). Also collect emails per user.
  const existingSubIds = new Set<string>();
  const grantsRes = await svc.from("comp_grants").select("ls_subscription_id").limit(20000);
  for (const row of grantsRes.data ?? []) {
    const id = str(row.ls_subscription_id);
    if (id) existingSubIds.add(id);
  }

  // 5) Build candidates, deduped by subscription (one comp per subscription).
  const bySub = new Map<string, Candidate>();
  for (const r of redemptions) {
    const order = orderByLsId.get(r.lsOrderId);
    if (!order || !order.userId) continue;
    const lsSubId = order.lsSubId ?? subByUser.get(order.userId) ?? null;
    if (!lsSubId || existingSubIds.has(lsSubId) || bySub.has(lsSubId)) continue;
    bySub.set(lsSubId, {
      lsSubscriptionId: lsSubId,
      userId: order.userId,
      userEmail: null,
      discountCode: r.discountCode,
      months: parseCompMonths(r.discountCode),
      issuedAt: r.createdAt,
    });
  }
  const candidates = [...bySub.values()];

  // 6) Resolve emails for the candidate users.
  const candidateUserIds = [...new Set(candidates.map((c) => c.userId))];
  const emailByUser = new Map<string, string | null>();
  for (const ids of chunk(candidateUserIds, CHUNK)) {
    const res = await svc.from("profiles").select("id,email").in("id", ids);
    for (const row of res.data ?? []) {
      const id = str(row.id);
      if (id) emailByUser.set(id, str(row.email));
    }
  }
  for (const c of candidates) c.userEmail = emailByUser.get(c.userId) ?? null;

  const summary = {
    ok: true,
    dryRun: dry,
    capped,
    discountsScanned: discounts.length,
    redemptionsScanned: redemptions.length,
    alreadyTracked: existingSubIds.size,
    toCreate: candidates.length,
    created: 0,
  };

  if (dry) {
    return NextResponse.json({
      ...summary,
      sample: candidates.slice(0, 25).map((c) => ({
        email: c.userEmail,
        code: c.discountCode,
        months: c.months,
        lsSubscriptionId: c.lsSubscriptionId,
      })),
    });
  }

  // 7) Insert. Per-row so one unique-violation (a concurrent grant) doesn't sink
  //    the batch.
  let created = 0;
  for (const c of candidates) {
    const { error } = await svc.from("comp_grants").insert({
      ls_subscription_id: c.lsSubscriptionId,
      user_id: c.userId,
      user_email: c.userEmail,
      discount_code: c.discountCode,
      months: c.months,
      months_source: c.months != null ? "parsed" : null,
      issued_at: c.issuedAt,
      source: "lemonsqueezy",
    });
    if (error) {
      console.error("comps/backfill: insert failed", { sub: c.lsSubscriptionId, error });
    } else {
      created++;
    }
  }

  console.log("comps/backfill: done", { by: actor.email, created, scanned: redemptions.length });
  return NextResponse.json({ ...summary, created });
}
