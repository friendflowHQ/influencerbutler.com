-- Link an affiliate payout to the clawback (negative) adjustments it settles.
--
-- When a refund or chargeback lands AFTER we already paid an affiliate their
-- commission, the order_refunded webhook records a negative
-- affiliate_commission_adjustments row (an open clawback). The automated PayPal
-- disburse then nets those open clawbacks against the next payout and records
-- their ids here, so they are marked reconciled only when PayPal confirms the
-- payout succeeded (mirroring how covered orders reconcile).
--
-- Nullable + additive, so existing payout rows are unaffected. The disburse code
-- degrades gracefully (pays without netting) if this column is missing, so
-- applying this migration is what actually turns clawback recovery on.

alter table public.affiliate_payouts
  add column if not exists adjustment_ids jsonb;
