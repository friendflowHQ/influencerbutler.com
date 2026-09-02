/**
 * Higher-level affiliate payout orchestration shared by the admin-disburse
 * route, the PayPal webhook, and the status poller. Keeps the money-sensitive
 * reconcile logic (stamp orders ONLY when a payout item actually succeeds) in
 * one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { applyClawbacks } from "@/lib/affiliate-commissions";
import { sendAffiliatePaymentSent } from "@/lib/commission-statement-email";
import { createPayoutBatch, paypalConfigured } from "@/lib/paypal";

export function payoutMinimumCents(): number {
  const raw = Number(process.env.AFFILIATE_PAYOUT_MINIMUM_CENTS);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 1000; // default $10
}

/**
 * One covered order on a payout ledger row. `owedCents` is the amount paid for
 * this order in THIS payout (a single monthly slice for an amortized annual
 * order, or the whole thing for a monthly order). `fullOwedCents` is the order's
 * total commission, so the reconcile step knows when it has been fully paid off.
 * Legacy rows may omit fullOwedCents; the reconcile treats those as fully paid.
 */
export type PayoutOrderRef = { id: string; owedCents: number; fullOwedCents?: number };

export type PayoutRow = {
  id: string;
  user_id: string;
  status: string;
  /** Amount sent, for the affiliate receipt email (optional; re-read if absent). */
  gross_cents?: number | null;
  order_ids: PayoutOrderRef[] | null;
  /** Clawback adjustment ids this payout settles (optional; may be absent if the
   *  column is not selected or not migrated yet). */
  adjustment_ids?: string[] | null;
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
  opts?: { sendReceipt?: boolean },
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

    // Reconcile covered orders INCREMENTALLY: add this payout's slice to the
    // order's reconciled_amount_cents, and only stamp reconciled_at once the
    // running total reaches the order's full commission (an annual order is paid
    // one twelfth at a time across the year). Idempotent per (payout, order):
    // an order already carrying this payout_id is skipped, and the ledger-status
    // early-return above stops a whole payout from being applied twice.
    for (const ref of row.order_ids ?? []) {
      const { data: ord, error: readErr } = await supabase
        .from("orders")
        .select("reconciled_amount_cents,payout_id")
        .eq("ls_order_id", ref.id)
        .maybeSingle();
      if (readErr) {
        console.error("applyPayoutStatus: order read failed", ref.id, readErr);
        continue;
      }
      if (!ord) continue;
      if ((ord.payout_id as string | null) === row.id) continue; // already applied by this payout

      const prevPaid =
        typeof ord.reconciled_amount_cents === "number" ? ord.reconciled_amount_cents : 0;
      const newPaid = prevPaid + ref.owedCents;
      // Legacy refs without fullOwedCents behave like the old whole-order stamp.
      const fullOwed = typeof ref.fullOwedCents === "number" ? ref.fullOwedCents : ref.owedCents;
      const fullyPaid = newPaid >= fullOwed;

      const { error } = await supabase
        .from("orders")
        .update({
          reconciled_amount_cents: newPaid,
          reconciled_by: "paypal-payout",
          payout_id: row.id,
          ...(fullyPaid ? { reconciled_at: nowIso } : {}),
        })
        .eq("ls_order_id", ref.id);
      if (error) console.error("applyPayoutStatus: order reconcile failed", ref.id, error);
    }

    // Settle any clawback adjustments this payout netted. Best-effort read so a
    // pre-migration environment (no adjustment_ids column) simply reconciles no
    // adjustments. Guarded on reconciled_at IS NULL so a replay is a no-op.
    let adjIds: string[] = Array.isArray(row.adjustment_ids)
      ? (row.adjustment_ids as string[])
      : [];
    if (adjIds.length === 0) {
      const { data: fresh } = await supabase
        .from("affiliate_payouts")
        .select("adjustment_ids")
        .eq("id", row.id)
        .maybeSingle();
      if (Array.isArray(fresh?.adjustment_ids)) adjIds = fresh.adjustment_ids as string[];
    }
    for (const adjId of adjIds) {
      const { error } = await supabase
        .from("affiliate_commission_adjustments")
        .update({ reconciled_at: nowIso, payout_id: row.id })
        .eq("id", adjId)
        .is("reconciled_at", null);
      if (error) console.error("applyPayoutStatus: adjustment reconcile failed", adjId, error);
    }

    // Receipt: tell the affiliate they've been paid. Best-effort and wrapped so
    // an email hiccup never blocks reconciliation. Fires once per payout because
    // the ledger-status early-return above stops this branch running twice.
    // Suppressed (sendReceipt:false) for out-of-band manual records, where the
    // affiliate already got PayPal's own notification at send time.
    if (opts?.sendReceipt !== false) try {
      let amountCents = typeof row.gross_cents === "number" ? row.gross_cents : 0;
      if (amountCents <= 0) {
        const { data: pay } = await supabase
          .from("affiliate_payouts")
          .select("gross_cents")
          .eq("id", row.id)
          .maybeSingle();
        if (typeof pay?.gross_cents === "number") amountCents = pay.gross_cents;
      }
      if (amountCents > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("email,paypal_email")
          .eq("id", row.user_id)
          .maybeSingle();
        const to = typeof prof?.email === "string" ? prof.email : null;
        if (to) {
          const { data: app } = await supabase
            .from("affiliate_applications")
            .select("full_name")
            .eq("user_id", row.user_id)
            .maybeSingle();
          await sendAffiliatePaymentSent({
            to,
            name: typeof app?.full_name === "string" ? app.full_name : null,
            amountCents,
            paypalEmail: typeof prof?.paypal_email === "string" ? prof.paypal_email : null,
          });
        }
      }
    } catch (err) {
      console.error("applyPayoutStatus: payment-sent email failed", row.id, err);
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

  // Pay only the PAYABLE amount: commission that is recognized (annual amortized
  // 1/12 per month) AND past the clearing buffer, netting anything already paid.
  // Computed all-time (not period-scoped) so an amortized annual order's cleared
  // twelfths from earlier months are included; `period` only labels the ledger.
  const commissions = await loadAffiliateCommissions({ userIds: [userId] });
  const stmt = commissions?.statements.find((s) => s.userId === userId) ?? null;
  const payableCents = stmt?.payableCents ?? 0;
  const minimum = payoutMinimumCents();
  if (payableCents < minimum) {
    return {
      ok: false,
      httpStatus: 409,
      code: "below_minimum",
      error: `Payable ${payableCents} cents is below the ${minimum}-cent minimum`,
    };
  }

  const orderRefs: PayoutOrderRef[] = (stmt?.payableLines ?? [])
    .filter((l) => l.payableNowCents > 0)
    .map((l) => ({ id: l.lsOrderId, owedCents: l.payableNowCents, fullOwedCents: l.fullOwedCents }));

  // Net any open CLAWBACK (negative) adjustments against this payout: a refund or
  // chargeback that landed after we already paid commission is recovered from the
  // next disbursement. Apply only clawbacks the current payable fully covers
  // (leave the rest open for a later round), and record their ids on the ledger
  // so they settle on real PayPal success. Positive make-whole adjustments keep
  // their own separate settle path (admin-makewhole-pay), so they are excluded.
  const { netPayableCents, appliedAdjustmentIds: appliedAdjIds } = applyClawbacks(
    payableCents,
    (stmt?.adjustments ?? []).map((a) => ({ id: a.id, amountCents: a.amountCents })),
  );
  if (netPayableCents < minimum) {
    return {
      ok: false,
      httpStatus: 409,
      code: "below_minimum",
      error: `Payable after clawbacks (${netPayableCents} cents) is below the ${minimum}-cent minimum`,
    };
  }

  let senderBatchId = buildSenderBatchId(userId, period);
  if (retrySuffix) senderBatchId = `${senderBatchId}_r${retrySuffix}`;
  const senderItemId = `${senderBatchId}_1`;
  const nowIso = new Date().toISOString();

  // Amount actually sent + adjustments actually settled. If the adjustment_ids
  // column has not been migrated in yet, fall back to paying the full payable
  // with no clawback netting (the clawbacks stay open for next time) rather than
  // failing the payout.
  let amountCents = netPayableCents;
  let ledgerAdjIds = appliedAdjIds;
  const insertLedger = (includeAdj: boolean) =>
    admin
      .from("affiliate_payouts")
      .insert({
        user_id: userId,
        period,
        gross_cents: amountCents,
        currency: "USD",
        fee_note: "Recipient bears PayPal receiving / currency-conversion fees.",
        order_ids: orderRefs,
        ...(includeAdj && ledgerAdjIds.length ? { adjustment_ids: ledgerAdjIds } : {}),
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

  let { data: inserted, error: insertErr } = await insertLedger(true);
  if (insertErr && (insertErr as { code?: string }).code === "42703" && ledgerAdjIds.length) {
    console.warn("disburseAffiliate: adjustment_ids column missing, paying without clawback netting");
    amountCents = payableCents;
    ledgerAdjIds = [];
    ({ data: inserted, error: insertErr } = await insertLedger(false));
  }

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

  // getAccessToken() throws on bad/missing creds or a base-URL/env mismatch
  // (e.g. live creds against the sandbox default). Catch it so the failure comes
  // back as a clean JSON error naming the cause instead of an HTML 500 that the
  // client can only render as a bare "Network error." (and so the ledger row is
  // marked failed rather than left dangling at 'pending').
  let result: Awaited<ReturnType<typeof createPayoutBatch>>;
  try {
    result = await createPayoutBatch({
      senderBatchId,
      emailSubject: "Your Influencer Butler affiliate commission",
      items: [
        {
          receiver: paypalEmail,
          amountCents,
          currency: "USD",
          senderItemId,
          note: period ? `Affiliate commission ${period}` : "Affiliate commission",
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("affiliate_payouts")
      .update({ status: "failed", error_note: msg.slice(0, 300), updated_at: new Date().toISOString() })
      .eq("id", payoutId);
    return { ok: false, httpStatus: 502, code: "paypal_call_failed", error: `PayPal call failed: ${msg.slice(0, 200)}` };
  }

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

  return { ok: true, payoutId, payoutBatchId: result.payoutBatchId, grossCents: amountCents };
}

export type ManualRecordOutcome =
  | { ok: true; payoutId: string; grossCents: number }
  | {
      ok: false;
      httpStatus: number;
      code?: string;
      error: string;
      existing?: { id: string; status: string } | null;
    };

/**
 * Record an out-of-band affiliate payment (admin already sent money via PayPal's
 * own UI, a bank transfer, etc.) against the ledger, reconciling ONLY the
 * currently-payable slice (recognized + past the 14-day clear), exactly like a
 * real PayPal payout. No money moves and no PayPal call is made here: this just
 * makes the books match reality. Unlike disburseAffiliate it does NOT require a
 * verified tax form or a PayPal email on file, since payment already happened.
 *
 * Idempotency: one manual record per affiliate per month. The sender_batch_id
 * carries a `manual_<period>` marker (UNIQUE), so a double-click cannot
 * double-record; a legitimate second manual payment lands in a later month.
 */
export async function recordManualPayout(params: {
  admin: SupabaseClient;
  actorEmail: string;
  userId: string;
  period: string; // 'YYYY-MM': ledger label + idempotency scope
  externalRef?: string | null; // e.g. the PayPal transaction id, kept for the record
  sendReceipt?: boolean; // default false: affiliate already got PayPal's own notice
}): Promise<ManualRecordOutcome> {
  const { admin, actorEmail, userId, period, externalRef } = params;

  const { data: profile } = await admin
    .from("profiles")
    .select("is_affiliate,paypal_email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_affiliate !== true) {
    return { ok: false, httpStatus: 404, error: "Not an affiliate" };
  }
  const paypalEmail = typeof profile.paypal_email === "string" ? profile.paypal_email.trim() : "";

  // Same PAYABLE computation as the PayPal path: recognized (annual amortized
  // 1/12 per month) AND past the clearing buffer, netting anything already paid.
  const commissions = await loadAffiliateCommissions({ userIds: [userId] });
  const stmt = commissions?.statements.find((s) => s.userId === userId) ?? null;
  const payableCents = stmt?.payableCents ?? 0;
  const minimum = payoutMinimumCents();
  if (payableCents < minimum) {
    return {
      ok: false,
      httpStatus: 409,
      code: "below_minimum",
      error: `Payable ${payableCents} cents is below the ${minimum}-cent minimum`,
    };
  }

  const orderRefs: PayoutOrderRef[] = (stmt?.payableLines ?? [])
    .filter((l) => l.payableNowCents > 0)
    .map((l) => ({ id: l.lsOrderId, owedCents: l.payableNowCents, fullOwedCents: l.fullOwedCents }));

  // Net any open clawbacks against this record, same as the PayPal path.
  const { netPayableCents, appliedAdjustmentIds: appliedAdjIds } = applyClawbacks(
    payableCents,
    (stmt?.adjustments ?? []).map((a) => ({ id: a.id, amountCents: a.amountCents })),
  );
  if (netPayableCents < minimum) {
    return {
      ok: false,
      httpStatus: 409,
      code: "below_minimum",
      error: `Payable after clawbacks (${netPayableCents} cents) is below the ${minimum}-cent minimum`,
    };
  }

  // Distinct from real PayPal batches (aff_<short>_<period>): aff_<short>_adhoc_manual_<period>.
  const senderBatchId = buildSenderBatchId(userId, null, `manual_${period}`);
  const senderItemId = `${senderBatchId}_1`;
  const nowIso = new Date().toISOString();

  let amountCents = netPayableCents;
  let ledgerAdjIds = appliedAdjIds;
  const insertLedger = (includeAdj: boolean) =>
    admin
      .from("affiliate_payouts")
      .insert({
        user_id: userId,
        period,
        gross_cents: amountCents,
        currency: "USD",
        fee_note: "Recorded manually: paid out-of-band (no PayPal Payouts call).",
        order_ids: orderRefs,
        ...(includeAdj && ledgerAdjIds.length ? { adjustment_ids: ledgerAdjIds } : {}),
        paypal_email: paypalEmail || null,
        paypal_batch_id: externalRef ? String(externalRef).slice(0, 200) : null,
        sender_batch_id: senderBatchId,
        sender_item_id: senderItemId,
        status: "pending",
        created_by: actorEmail,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id,status")
      .maybeSingle();

  let { data: inserted, error: insertErr } = await insertLedger(true);
  if (insertErr && (insertErr as { code?: string }).code === "42703" && ledgerAdjIds.length) {
    console.warn("recordManualPayout: adjustment_ids column missing, recording without clawback netting");
    amountCents = payableCents;
    ledgerAdjIds = [];
    ({ data: inserted, error: insertErr } = await insertLedger(false));
  }

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
        code: "already_recorded",
        error: "A manual payout for this affiliate and month is already recorded.",
        existing: (existing as { id: string; status: string } | null) ?? null,
      };
    }
    console.error("recordManualPayout: ledger insert failed", insertErr);
    return { ok: false, httpStatus: 500, error: "Could not record payout" };
  }

  const payoutId = inserted?.id as string | undefined;
  if (!payoutId) return { ok: false, httpStatus: 500, error: "Could not record payout" };

  // Reuse the exact payout-success reconcile: accumulate reconciled_amount_cents
  // per order, stamp reconciled_at only once an order is fully paid across
  // months, and settle clawbacks. Receipt suppressed unless the caller opts in.
  await applyPayoutStatus(
    admin,
    {
      id: payoutId,
      user_id: userId,
      status: "pending",
      gross_cents: amountCents,
      order_ids: orderRefs,
      adjustment_ids: ledgerAdjIds,
      paypal_batch_id: null,
      sender_item_id: senderItemId,
    },
    "success",
    { sendReceipt: params.sendReceipt === true },
  );

  return { ok: true, payoutId, grossCents: amountCents };
}
