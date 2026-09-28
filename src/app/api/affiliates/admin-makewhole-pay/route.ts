/**
 * POST /api/affiliates/admin-makewhole-pay
 *
 * Records that a make-whole (or manual) affiliate adjustment has been PAID out of
 * band via PayPal. The actual money is sent by hand (per the manual-PayPal
 * decision); this route just makes the payment reconcile everywhere:
 *
 *   - writes an ad-hoc affiliate_payouts row (period null, status 'success'),
 *     which is what the 1099 summary + Xero export read, and
 *   - stamps the adjustment reconciled_at + payout_id so it stops showing as
 *     owed on the affiliate's dashboard / statement.
 *
 * Idempotent: the payout's sender_batch_id is derived deterministically from the
 * adjustment id, so a double-submit collides (23505) instead of paying twice, and
 * the reconcile stamp is guarded on reconciled_at IS NULL.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { buildSenderBatchId } from "@/lib/paypal-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { adjustmentId?: unknown };

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        is: (col: string, val: null) => Promise<{ error: unknown }>;
      };
    };
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.payout", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const adjustmentId = str(body.adjustmentId);
  if (!adjustmentId) {
    return NextResponse.json({ error: "adjustmentId is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = adminClient as unknown as Db;

  const { data: adj, error: adjErr } = await db
    .from("affiliate_commission_adjustments")
    .select("id,user_id,amount_cents,currency,note,reconciled_at,payout_id")
    .eq("id", adjustmentId)
    .maybeSingle();
  if (adjErr) {
    console.error("makewhole-pay: adjustment read failed", adjErr);
    return NextResponse.json({ error: "Adjustment lookup failed." }, { status: 500 });
  }
  if (!adj) return NextResponse.json({ error: "Adjustment not found." }, { status: 404 });
  if (adj.reconciled_at) {
    return NextResponse.json({ ok: true, alreadyPaid: true, payoutId: adj.payout_id ?? null });
  }

  const affiliateUserId = str(adj.user_id);
  const amountCents = typeof adj.amount_cents === "number" ? adj.amount_cents : 0;
  if (!affiliateUserId || amountCents <= 0) {
    return NextResponse.json({ error: "Adjustment is missing an affiliate or amount." }, { status: 422 });
  }

  // Snapshot the affiliate's PayPal email for the ledger record (best-effort).
  let paypalEmail: string | null = null;
  const { data: prof } = await db
    .from("profiles")
    .select("paypal_email")
    .eq("id", affiliateUserId)
    .maybeSingle();
  if (prof) paypalEmail = str(prof.paypal_email);

  const nowIso = new Date().toISOString();
  const senderBatchId = buildSenderBatchId(affiliateUserId, null, `adj-${adjustmentId.slice(0, 8)}`);

  // Write the paid ledger row. A replay collides on the UNIQUE sender_batch_id;
  // recover the existing row's id so we still stamp the adjustment.
  let payoutId: string | null = null;
  const { data: inserted, error: insErr } = await db
    .from("affiliate_payouts")
    .insert({
      user_id: affiliateUserId,
      period: null,
      gross_cents: amountCents,
      currency: str(adj.currency) ?? "USD",
      fee_note: str(adj.note) ?? "Affiliate make-whole adjustment (manual PayPal).",
      order_ids: [],
      paypal_email: paypalEmail,
      sender_batch_id: senderBatchId,
      status: "success",
      created_by: actor.email ?? actor.userId ?? null,
      created_at: nowIso,
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      const { data: existing } = await db
        .from("affiliate_payouts")
        .select("id")
        .eq("sender_batch_id", senderBatchId)
        .maybeSingle();
      payoutId = (existing?.id as string | undefined) ?? null;
    } else {
      console.error("makewhole-pay: payout insert failed", insErr);
      return NextResponse.json({ error: "Could not record the payout." }, { status: 500 });
    }
  } else {
    payoutId = (inserted?.id as string | undefined) ?? null;
  }

  // Settle the adjustment (guarded so a replay can't re-stamp).
  const { error: stampErr } = await db
    .from("affiliate_commission_adjustments")
    .update({ reconciled_at: nowIso, payout_id: payoutId })
    .eq("id", adjustmentId)
    .is("reconciled_at", null);
  if (stampErr) {
    console.error("makewhole-pay: adjustment stamp failed", stampErr);
    return NextResponse.json({ error: "Recorded the payout but could not settle the adjustment." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.makewhole.paid",
    targetType: "user",
    targetId: affiliateUserId,
    details: { adjustmentId, payoutId, amountCents, senderBatchId },
  });

  return NextResponse.json({ ok: true, payoutId, amountCents });
}
