/**
 * Higher-level affiliate payout orchestration shared by the admin-disburse
 * route, the PayPal webhook, and the status poller. Keeps the money-sensitive
 * reconcile logic (stamp orders ONLY when a payout item actually succeeds) in
 * one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { createPayoutBatch, paypalConfigured } from "@/lib/paypal";

export function payoutMinimumCents(): number {
  const raw = Number(process.env.AFFILIATE_PAYOUT_MINIMUM_CENTS);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 1000; // default $10
}

/** One covered order on a payout ledger row. */
export type PayoutOrderRef = { id: string; owedCents: number };

export type PayoutRow = {
  id: string;
  user_id: string;
  status: string;
  order_ids: PayoutOrderRef[] | null;
  paypal_batch_id: string | null;
  sender_item_id: string | null;
};

/**
 * Maps a PayPal payout-item transaction_status to our ledger status. Only
 * SUCCESS reconciles orders; everything else leaves them owed for retry.
 */
export function mapTransactionStatus(paypalStatus: string | null): string {
  switch ((paypalStatus ?? "").toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "failed";
    case "DENIED":
      return "denied";
    case "BLOCKED":
      return "blocked";
    case "UNCLAIMED":
      return "unclaimed";
    case "RETURNED":
    case "REFUNDED":
      return "returned";
    case "CANCELED":
      return "failed";
    default:
      return "processing";
  }
}

/**
 * Applies a terminal (or in-flight) status to a payout ledger row. On success
 * it stamps every covered order reconciled + payout_id (guarded so a replay
 * never double-stamps). On any non-success it records the status and leaves the
 * orders unreconciled so they reappear as owed.
 *
 * Idempotent: a row already at the target status is a no-op.
 */
export async function applyPayoutStatus(
  supabase: SupabaseClient,
  row: PayoutRow,
  ledgerStatus: string,
): Promise<void> {
  if (row.status === ledgerStatus) return;

  const nowIso = new Date().toISOString();

  if (ledgerStatus === "success") {
    const { error: ledgerErr } = await supabase
      .from("affiliate_payouts")
      .update({ status: "success", paid_at: nowIso, updated_at: nowIso, error_note: null })
      .eq("id", row.id)
      .neq("status", "success");
    if (ledgerErr) {
      console.error("applyPayoutStatus: ledger success update failed", ledgerErr);
      return;
    }

    // Stamp covered orders. Guard on reconciled_at IS NULL so a replayed webhook
    // can't re-stamp, and carry the per-order owed as the reconciled amount.
    for (const ref of row.order_ids ?? []) {
      const { error } = await supabase
        .from("orders")
        .update({
          reconciled_at: nowIso,
          reconciled_amount_cents: ref.owedCents,
          reconciled_by: "paypal-payout",
          payout_id: row.id,
        })
        .eq("ls_order_id", ref.id)
        .is("reconciled_at", null);
      if (error) console.error("applyPayoutStatus: order stamp failed", ref.id, error);
    }
    return;
  }

  // Non-success terminal (or still-processing) status: record it, leave orders owed.
  const { error } = await supabase
    .from("affiliate_payouts")
    .update({
      status: ledgerStatus,
      error_note: ledgerStatus === "processing" ? null : `PayPal reported ${ledgerStatus}`,
      updated_at: nowIso,
    })
    .eq("id", row.id);
  if (error) console.error("applyPayoutStatus: ledger status update failed", error);
}

/**
 * Deterministic sender_batch_id so a double-click / retry for the same affiliate
 * + period collides on the UNIQUE column instead of paying twice. Ad-hoc payouts
 * (no period) get a caller-supplied suffix so distinct manual payouts differ.
 */
export function buildSenderBatchId(userId: string, period: string | null, suffix?: string): string {
  const short = userId.replace(/-/g, "").slice(0, 12);
  if (period) return `aff_${short}_${period}`;
  return `aff_${short}_adhoc_${suffix ?? "1"}`;
}

export type DisburseOutcome =
  | { ok: true; payoutId: string; payoutBatchId: string; grossCents: number }
  | {
      ok: false;
      httpStatus: number;
      code?: string;
      error: string;
      existing?: { id: string; status: string } | null;
    };

/**
 * Core money-movement for one affiliate, shared by the admin-disburse route and
 * the retry route. Enforces preconditions (verified tax + PayPal email + owed >=
 * minimum), writes the ledger row BEFORE calling PayPal (idempotency via UNIQUE
 * sender_batch_id), and never reconciles orders here (that happens on real
 * success via webhook/poller). Owed is recomputed from the commission engine.
 *
 * `retrySuffix` gives a fresh sender_batch_id for a retry of a prior failed
 * payout, so the failed row is preserved for history and PayPal accepts the
 * new batch.
 */
export async function disburseAffiliate(params: {
  admin: SupabaseClient;
  actorEmail: string;
  userId: string;
  period: string | null;
  retrySuffix?: string;
}): Promise<DisburseOutcome> {
  const { admin, actorEmail, userId, period, retrySuffix } = params;

  if (!paypalConfigured()) {
    return { ok: false, httpStatus: 503, error: "PayPal is not configured" };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("is_affiliate,paypal_email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_affiliate !== true) {
    return { ok: false, httpStatus: 404, error: "Not an affiliate" };
  }
  const paypalEmail = typeof profile.paypal_email === "string" ? profile.paypal_email.trim() : "";
  if (!paypalEmail) {
    return { ok: false, httpStatus: 409, code: "no_paypal", error: "Affiliate has no PayPal email on file" };
  }

  const { data: tax } = await admin
    .from("affiliate_tax_forms")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tax || tax.status !== "verified") {
    return { ok: false, httpStatus: 409, code: "tax_unverified", error: "Affiliate's tax form is not verified" };
  }

  const commissions = await loadAffiliateCommissions({ userIds: [userId], period: period ?? undefined });
  const stmt = commissions?.statements.find((s) => s.userId === userId) ?? null;
  const owedCents = stmt?.owedCents ?? 0;
  const minimum = payoutMinimumCents();
  if (owedCents < minimum) {
    return {
      ok: false,
      httpStatus: 409,
      code: "below_minimum",
      error: `Owed ${owedCents} cents is below the ${minimum}-cent minimum`,
    };
  }

  const orderRefs: PayoutOrderRef[] = (stmt?.lines ?? [])
    .filter((l) => l.owedCents > 0)
    .map((l) => ({ id: l.lsOrderId, owedCents: l.owedCents }));

  let senderBatchId = buildSenderBatchId(userId, period);
  if (retrySuffix) senderBatchId = `${senderBatchId}_r${retrySuffix}`;
  const senderItemId = `${senderBatchId}_1`;
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertErr } = await admin
    .from("affiliate_payouts")
    .insert({
      user_id: userId,
      period,
      gross_cents: owedCents,
      currency: "USD",
      fee_note: "Recipient bears PayPal receiving / currency-conversion fees.",
      order_ids: orderRefs,
      paypal_email: paypalEmail,
      sender_batch_id: senderBatchId,
      sender_item_id: senderItemId,
      status: "pending",
      created_by: actorEmail,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id,status")
    .maybeSingle();

  if (insertErr) {
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      const { data: existing } = await admin
        .from("affiliate_payouts")
        .select("id,status")
        .eq("sender_batch_id", senderBatchId)
        .maybeSingle();
      return {
        ok: false,
        httpStatus: 409,
        code: "already_disbursed",
        error: "A payout for this affiliate and period already exists.",
        existing: (existing as { id: string; status: string } | null) ?? null,
      };
    }
    console.error("disburseAffiliate: ledger insert failed", insertErr);
    return { ok: false, httpStatus: 500, error: "Could not create payout" };
  }

  const payoutId = inserted?.id as string | undefined;
  if (!payoutId) return { ok: false, httpStatus: 500, error: "Could not create payout" };

  const result = await createPayoutBatch({
    senderBatchId,
    emailSubject: "Your Influencer Butler affiliate commission",
    items: [
      {
        receiver: paypalEmail,
        amountCents: owedCents,
        currency: "USD",
        senderItemId,
        note: period ? `Affiliate commission ${period}` : "Affiliate commission",
      },
    ],
  });

  if (!result.ok) {
    await admin
      .from("affiliate_payouts")
      .update({ status: "failed", error_note: result.error.slice(0, 300), updated_at: new Date().toISOString() })
      .eq("id", payoutId);
    return { ok: false, httpStatus: 502, error: `PayPal rejected the payout: ${result.error.slice(0, 200)}` };
  }

  await admin
    .from("affiliate_payouts")
    .update({
      paypal_batch_id: result.payoutBatchId,
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutId);

  return { ok: true, payoutId, payoutBatchId: result.payoutBatchId, grossCents: owedCents };
}
