import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { listStoreAffiliates } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly affiliate payout view (the custom-rate top-up path).
 *
 * GET  ?period=YYYY-MM -> per custom-rate affiliate: their commissionable orders
 *        that month, what LS already paid (30%), and what we still owe on top.
 *        Also returns a Lemon Squeezy cross-check (LS-reported cumulative
 *        earnings per affiliate) so the admin can spot referrals LS credited
 *        that our order capture missed (e.g. a raw LS affiliate link).
 * POST -> mark a set of the month's orders reconciled for one affiliate (stamps
 *        reconciled_at/amount/by, guarded against double-stamping), which is the
 *        paid/unpaid ledger. Shares the reconciled stamp with the Owed tab, so a
 *        given order is only ever paid once.
 */

function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || currentPeriod();

  const result = await loadAffiliateCommissions({ period, customRatesOnly: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Lemon Squeezy cross-check: cumulative earnings per linked affiliate. If LS
  // shows more than we attributed, a referral slipped past our capture.
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  let lsAvailable = false;
  const lsById = new Map<string, { totalEarningsCents: number; unpaidEarningsCents: number }>();
  if (storeId) {
    try {
      const storeAffiliates = await listStoreAffiliates(storeId);
      lsAvailable = storeAffiliates.length > 0;
      for (const a of storeAffiliates) {
        lsById.set(a.id, {
          totalEarningsCents: a.totalEarningsCents,
          unpaidEarningsCents: a.unpaidEarningsCents,
        });
      }
    } catch (error) {
      console.error("admin-payouts: LS list threw", error);
    }
  }

  const affiliates = result.statements.map((s) => {
    const ls = s.lsAffiliateId ? lsById.get(s.lsAffiliateId) ?? null : null;
    return {
      ...s,
      ls: ls
        ? { totalEarningsCents: ls.totalEarningsCents, unpaidEarningsCents: ls.unpaidEarningsCents }
        : null,
    };
  });

  return NextResponse.json({
    admin: { email: actor.email },
    period,
    lsAvailable,
    affiliates,
  });
}

type MarkClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => {
        is: (col: string, value: null) => Promise<{ error: unknown }>;
      };
    };
  };
};

type MarkPaidBody = {
  userId?: string;
  period?: string;
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
  const period = body.period?.trim() || null;
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map((id) => String(id).trim()).filter((id) => id.length > 0)
    : [];
  const amountCents =
    typeof body.amountCents === "number" && Number.isFinite(body.amountCents)
      ? Math.round(body.amountCents)
      : null;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (orderIds.length === 0) return NextResponse.json({ error: "Missing orderIds" }, { status: 400 });

  const supabase = createAdminClient() as unknown as MarkClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const reconciledAt = new Date().toISOString();
  let reconciledCount = 0;
  const failed: string[] = [];

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
      console.error("admin-payouts: mark-paid update failed", lsOrderId, error);
      failed.push(lsOrderId);
    } else {
      reconciledCount += 1;
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.payout",
    targetType: "user",
    targetId: userId,
    details: { period, orderIds, amountCents, reconciledCount, failed },
  });

  if (failed.length > 0) {
    return NextResponse.json(
      { ok: false, reconciledCount, failed, error: "Some orders could not be marked paid" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reconciledCount });
}
