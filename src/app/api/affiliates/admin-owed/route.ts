import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owed-commissions reconciliation feed (the pre-LS-activation gap payout path).
 *
 * When an affiliate is approved their branded code goes live immediately, but
 * Lemon Squeezy only credits commission (via aff_ref) after it activates them,
 * days later. Orders referred during that gap are captured on the order with
 * attribution_status='pending' (see the checkout routes + order_created
 * webhook) but earn the affiliate nothing in LS. LS has no API to back-date a
 * commission, so we surface what's owed here and the admin pays it as a
 * one-time manual bonus inside the LS dashboard, then marks it reconciled.
 *
 *  GET  -> per now-active affiliate, their pending unreconciled paid orders and
 *          the commission owed (AFFILIATE_COMMISSION_PERCENT, default 30%).
 *  POST -> mark a set of orders reconciled (stamps reconciled_at/amount/by),
 *          so they drop off the report. Guarded against double-stamping.
 *
 * Refund caveat: the webhook does not handle order_refunded, so orders.status
 * stays 'paid' after a later refund. We filter status='paid' but cannot detect
 * post-hoc refunds - the admin must verify against the LS dashboard before
 * paying. The response sets verifyAgainstLs=true to surface this in the UI.
 */

function commissionPercent(): number {
  const raw = Number(process.env.AFFILIATE_COMMISSION_PERCENT);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 30;
}

type RowsResult = Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;

type OwedQuery = RowsResult & {
  eq: (col: string, value: string | boolean) => OwedQuery;
};

type OwedClient = {
  from: (table: string) => {
    select: (cols: string) => OwedQuery;
    update: (payload: Record<string, unknown>) => {
      eq: (
        col: string,
        value: string,
      ) => {
        is: (col: string, value: null) => Promise<{ error: unknown }>;
      };
    };
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

type OwedOrder = {
  lsOrderId: string;
  totalCents: number;
  currency: string | null;
  createdAt: string | null;
};

type OwedAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  lsAffiliateId: string;
  orderCount: number;
  grossCents: number;
  owedCents: number;
  orders: OwedOrder[];
};

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as OwedClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const percent = commissionPercent();

  try {
    // Only affiliates LS has activated can be paid (and only they should appear
    // here - a still-unlinked affiliate's referrals stay pending until linked).
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id,email,affiliate_code,ls_affiliate_id")
      .eq("is_affiliate", true);
    if (profilesErr) {
      console.error("admin-owed: profiles query failed", profilesErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const activeByUser = new Map<
      string,
      { email: string | null; affiliateCode: string | null; lsAffiliateId: string }
    >();
    for (const row of profiles ?? []) {
      const userId = str(row.id);
      const lsId = str(row.ls_affiliate_id);
      if (!userId || !lsId) continue; // unlinked -> not yet payable
      activeByUser.set(userId, {
        email: str(row.email),
        affiliateCode: str(row.affiliate_code),
        lsAffiliateId: lsId,
      });
    }

    // Display names from applications.
    const { data: apps } = await supabase
      .from("affiliate_applications")
      .select("user_id,full_name");
    const nameByUser = new Map<string, string | null>();
    for (const row of apps ?? []) {
      const userId = str(row.user_id);
      if (userId) nameByUser.set(userId, str(row.full_name));
    }

    // Pending captured referrals. Filter the rest in JS (the thin client only
    // chains .eq): not yet reconciled, still paid, and for a now-active affiliate.
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select(
        "ls_order_id,user_id,total,currency,status,attribution_status,reconciled_at,ref_affiliate_user_id,created_at",
      )
      .eq("attribution_status", "pending");
    if (ordersErr) {
      console.error("admin-owed: orders query failed", ordersErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const byAffiliate = new Map<string, OwedAffiliate>();
    for (const row of orders ?? []) {
      if (str(row.reconciled_at)) continue;
      if (str(row.status) !== "paid") continue;
      const affUserId = str(row.ref_affiliate_user_id);
      if (!affUserId) continue;
      const active = activeByUser.get(affUserId);
      if (!active) continue; // affiliate not linked yet -> stays pending

      const totalCents = typeof row.total === "number" ? row.total : 0;
      const lsOrderId = str(row.ls_order_id);
      if (!lsOrderId) continue;

      let entry = byAffiliate.get(affUserId);
      if (!entry) {
        entry = {
          userId: affUserId,
          email: active.email,
          fullName: nameByUser.get(affUserId) ?? null,
          affiliateCode: active.affiliateCode,
          lsAffiliateId: active.lsAffiliateId,
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

    const affiliates = [...byAffiliate.values()].map((a) => ({
      ...a,
      owedCents: Math.round((a.grossCents * percent) / 100),
    }));
    affiliates.sort((x, y) => y.owedCents - x.owedCents);

    return NextResponse.json({
      admin: { email: actor.email },
      commissionPercent: percent,
      verifyAgainstLs: true,
      affiliates,
    });
  } catch (error) {
    console.error("admin-owed GET failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

type MarkPaidBody = {
  userId?: string;
  orderIds?: string[];
  amountCents?: number;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: MarkPaidBody;
  try {
    body = (await request.json()) as MarkPaidBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map((id) => String(id).trim()).filter((id) => id.length > 0)
    : [];
  const amountCents =
    typeof body.amountCents === "number" && Number.isFinite(body.amountCents)
      ? Math.round(body.amountCents)
      : null;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Missing orderIds" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as OwedClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const reconciledAt = new Date().toISOString();
  let reconciledCount = 0;
  const failed: string[] = [];

  // Stamp each order, guarded by `.is('reconciled_at', null)` so a double-submit
  // never re-stamps an already-paid referral.
  for (const lsOrderId of orderIds) {
    const { error } = await supabase
      .from("orders")
      .update({
        reconciled_at: reconciledAt,
        reconciled_amount_cents: amountCents,
        reconciled_by: actor.email,
      })
      .eq("ls_order_id", lsOrderId)
      .is("reconciled_at", null);
    if (error) {
      console.error("admin-owed: mark-paid update failed", lsOrderId, error);
      failed.push(lsOrderId);
    } else {
      reconciledCount += 1;
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.reconcile",
    targetType: "user",
    targetId: userId,
    details: { orderIds, amountCents, reconciledCount, failed },
  });

  if (failed.length > 0) {
    return NextResponse.json(
      { ok: false, reconciledCount, failed, error: "Some orders could not be marked paid" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reconciledCount });
}
