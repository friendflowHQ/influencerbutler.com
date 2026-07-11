import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayoutBatch } from "@/lib/paypal";
import { applyPayoutStatus, mapTransactionStatus, type PayoutRow } from "@/lib/paypal-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Backup reconciler for payouts stuck in 'processing' (missed/failed webhook).
 * Polls PayPal for each and applies the terminal status. Gated on CRON_SECRET.
 * ?dry=1 reports what it would do without writing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("affiliate_payouts")
    .select("id,user_id,status,order_ids,paypal_batch_id,sender_item_id")
    .eq("status", "processing")
    .not("paypal_batch_id", "is", null)
    .limit(100);

  if (error) {
    console.error("payout-status cron: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const results: Array<{ id: string; from: string; to: string }> = [];

  for (const r of (rows ?? []) as PayoutRow[]) {
    if (!r.paypal_batch_id) continue;
    const batch = await getPayoutBatch(r.paypal_batch_id);
    if (!batch.ok) {
      console.error("payout-status cron: getPayoutBatch failed", r.id, batch.error);
      continue;
    }
    // Single-item batches: take the first item's status.
    const item = batch.items[0];
    const ledgerStatus = mapTransactionStatus(item?.transactionStatus ?? null);
    if (ledgerStatus === "processing") continue; // still pending, leave it

    results.push({ id: r.id, from: r.status, to: ledgerStatus });
    if (!dry) {
      await applyPayoutStatus(admin, r, ledgerStatus);
    }
  }

  return NextResponse.json({ ok: true, dry, checked: rows?.length ?? 0, transitions: results });
}
