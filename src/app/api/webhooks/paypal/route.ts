import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, type WebhookHeaders } from "@/lib/paypal";
import { applyPayoutStatus, mapTransactionStatus, type PayoutRow } from "@/lib/paypal-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayPal Payouts webhook. Reconciles the affiliate_payouts ledger (and stamps
 * covered orders) only when a payout item actually succeeds. Every event is
 * signature-verified against PAYPAL_PAYOUTS_WEBHOOK_ID; unverified events are
 * rejected. Idempotent: applyPayoutStatus no-ops when already at target status.
 *
 * Handled: PAYMENT.PAYOUTS-ITEM.SUCCEEDED / FAILED / DENIED / BLOCKED /
 * UNCLAIMED / RETURNED / REFUNDED / CANCELED.
 */

type PayoutItemResource = {
  payout_batch_id?: string;
  transaction_status?: string;
  payout_item?: { sender_item_id?: string };
  payout_item_id?: string;
};

export async function POST(request: Request) {
  const raw = await request.text();

  const headers: WebhookHeaders = {
    transmissionId: request.headers.get("paypal-transmission-id"),
    transmissionTime: request.headers.get("paypal-transmission-time"),
    transmissionSig: request.headers.get("paypal-transmission-sig"),
    certUrl: request.headers.get("paypal-cert-url"),
    authAlgo: request.headers.get("paypal-auth-algo"),
  };

  let event: { event_type?: string; resource?: PayoutItemResource };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verified = await verifyWebhookSignature(headers, event);
  if (!verified) {
    console.error("paypal webhook: signature verification failed", {
      eventType: event.event_type,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = event.event_type ?? "";
  // We only care about per-item payout events.
  if (!eventType.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const resource = event.resource ?? {};
  const payoutBatchId = resource.payout_batch_id ?? null;
  const senderItemId = resource.payout_item?.sender_item_id ?? null;
  const ledgerStatus = mapTransactionStatus(resource.transaction_status ?? null);

  const admin = createAdminClient();

  // Match the ledger row by PayPal batch id first, then sender_item_id.
  let row: PayoutRow | null = null;
  if (payoutBatchId) {
    const { data } = await admin
      .from("affiliate_payouts")
      .select("id,user_id,status,order_ids,paypal_batch_id,sender_item_id")
      .eq("paypal_batch_id", payoutBatchId)
      .maybeSingle();
    row = (data as PayoutRow | null) ?? null;
  }
  if (!row && senderItemId) {
    const { data } = await admin
      .from("affiliate_payouts")
      .select("id,user_id,status,order_ids,paypal_batch_id,sender_item_id")
      .eq("sender_item_id", senderItemId)
      .maybeSingle();
    row = (data as PayoutRow | null) ?? null;
  }

  if (!row) {
    console.warn("paypal webhook: no ledger row for event", { payoutBatchId, senderItemId });
    // 200 so PayPal doesn't retry forever for an event we can't match.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Persist the PayPal item id if we have it and don't yet.
  if (resource.payout_item_id) {
    await admin
      .from("affiliate_payouts")
      .update({ paypal_item_id: resource.payout_item_id })
      .eq("id", row.id)
      .is("paypal_item_id", null);
  }

  await applyPayoutStatus(admin, row, ledgerStatus);

  return NextResponse.json({ ok: true, status: ledgerStatus });
}
