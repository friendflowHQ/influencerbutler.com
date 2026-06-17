-- Durable affiliate-attribution capture on orders.
--
-- Closes the pre-LS-activation gap: when an affiliate is approved we create
-- their branded code immediately, but Lemon Squeezy only sets ls_affiliate_id
-- (and thus pays commission via aff_ref) after its own review, days later. Any
-- order referred during that gap earns the affiliate nothing and, until now,
-- left no record of who referred it.
--
-- The checkout routes now stamp the intended affiliate into LS checkout custom
-- data; the order_created webhook persists it here. attribution_status is
-- 'pending' for gap-window referrals (LS did NOT credit, owe a manual bonus),
-- 'live' when aff_ref already credited LS (informational only), or NULL when no
-- affiliate referred the order. The reconciled_* columns are stamped when an
-- admin pays the owed bonus, so a paid referral drops off the owed report.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that writes these columns,
-- or the order_created handler will error (and LS will still show 200).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ref_affiliate_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS ref_affiliate_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS attribution_status TEXT NULL
    CHECK (attribution_status IN ('live', 'pending')),
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reconciled_amount_cents INTEGER NULL,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT NULL;

-- Fast lookup of a given affiliate's pending, not-yet-paid referrals for the
-- admin owed-commissions report.
CREATE INDEX IF NOT EXISTS orders_pending_attribution_idx
  ON orders (ref_affiliate_user_id)
  WHERE attribution_status = 'pending' AND reconciled_at IS NULL;
