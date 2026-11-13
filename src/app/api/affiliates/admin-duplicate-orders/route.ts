import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Suspected double-stored charges (2026-11-13).
 *
 * A no-trial checkout's first charge could be stored twice: once by
 * order_created (ls_order_id = order id) and again by
 * subscription_payment_success when the invoice carried no order_id (stored
 * under the invoice id). Each copy earned affiliate commission. The webhook now
 * skips that second copy; this route finds the ones already stored.
 *
 *  GET  -> read-only list: same buyer, same total, both paid, within 1 hour,
 *          with the referring affiliate and commission already paid on each.
 *  POST {lsOrderIds: string[]} -> marks those rows status='duplicate' (no longer
 *          commissionable) and claws back commission already paid on them.
 *          Only run on a list the owner has reviewed.
 */

type OrderRow = {
  ls_order_id: string;
  user_id: string | null;
  total: number | null;
  status: string | null;
  created_at: string | null;
  ls_subscription_id: string | null;
  ref_affiliate_user_id: string | null;
  reconciled_amount_cents: number | null;
  currency: string | null;
};

const PAGE = 1000;
const WINDOW_MS = 60 * 60 * 1000;

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rows: OrderRow[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await db
      .from("orders")
      .select(
        "ls_order_id,user_id,total,status,created_at,ls_subscription_id,ref_affiliate_user_id,reconciled_amount_cents,currency",
      )
      .eq("status", "paid")
      .gt("total", 0)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as OrderRow[]));
    if ((data ?? []).length < PAGE) break;
  }

  const byBuyer = new Map<string, OrderRow[]>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const list = byBuyer.get(r.user_id) ?? [];
    list.push(r);
    byBuyer.set(r.user_id, list);
  }

  const pairs: { keep: OrderRow; duplicate: OrderRow }[] = [];
  for (const list of byBuyer.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.total !== b.total) continue;
        const ta = Date.parse(a.created_at ?? "");
        const tb = Date.parse(b.created_at ?? "");
        if (!Number.isFinite(ta) || !Number.isFinite(tb) || Math.abs(tb - ta) > WINDOW_MS) continue;
        // Keep the earlier row (order_created usually lands first); flag the later one.
        pairs.push({ keep: a, duplicate: b });
      }
    }
  }

  const summary = pairs.map(({ keep, duplicate }) => ({
    buyerUserId: keep.user_id,
    totalCents: keep.total,
    currency: keep.currency,
    keep: { lsOrderId: keep.ls_order_id, createdAt: keep.created_at, paidCommissionCents: keep.reconciled_amount_cents ?? 0 },
    duplicate: {
      lsOrderId: duplicate.ls_order_id,
      createdAt: duplicate.created_at,
      paidCommissionCents: duplicate.reconciled_amount_cents ?? 0,
    },
    affiliateUserId: duplicate.ref_affiliate_user_id ?? keep.ref_affiliate_user_id,
  }));
  return NextResponse.json({
    ok: true,
    scannedPaidOrders: rows.length,
    suspectedDuplicates: summary.length,
    withAffiliate: summary.filter((s) => s.affiliateUserId).length,
    commissionAlreadyPaidOnDuplicatesCents: summary.reduce((s, x) => s + (x.duplicate.paidCommissionCents || 0), 0),
    pairs: summary,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: { lsOrderIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.lsOrderIds)
    ? body.lsOrderIds.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 200)
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "lsOrderIds required" }, { status: 400 });

  const done: { lsOrderId: string; clawbackCents: number }[] = [];
  for (const id of ids) {
    const { data: order } = await db
      .from("orders")
      .select("ls_order_id,status,ref_affiliate_user_id,reconciled_amount_cents,currency")
      .eq("ls_order_id", id)
      .maybeSingle();
    if (!order || order.status !== "paid") continue;
    const { error } = await db.from("orders").update({ status: "duplicate" }).eq("ls_order_id", id);
    if (error) continue;
    let clawback = 0;
    const paid = typeof order.reconciled_amount_cents === "number" ? order.reconciled_amount_cents : 0;
    if (order.ref_affiliate_user_id && paid > 0) {
      const { data: prior } = await db
        .from("affiliate_commission_adjustments")
        .select("amount_cents")
        .eq("related_customer", id);
      const already = (prior ?? []).reduce(
        (s: number, r: { amount_cents: number | null }) => s + (r.amount_cents && r.amount_cents < 0 ? -r.amount_cents : 0),
        0,
      );
      clawback = Math.max(0, paid - already);
      if (clawback > 0) {
        await db.from("affiliate_commission_adjustments").insert({
          user_id: order.ref_affiliate_user_id,
          amount_cents: -clawback,
          currency: order.currency ?? "USD",
          note: `Duplicate charge record ${id}: commission paid twice, reversed`,
          source: "manual",
          related_customer: id,
          created_by: `admin:${actor.email ?? "unknown"}`,
        });
      }
    }
    done.push({ lsOrderId: id, clawbackCents: clawback });
  }
  await logAdminAction({
    actor,
    action: "affiliate.orders.mark_duplicate",
    targetType: "orders",
    targetId: null,
    details: { marked: done },
  });
  return NextResponse.json({ ok: true, marked: done });
}
