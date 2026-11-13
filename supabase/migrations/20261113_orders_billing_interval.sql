-- Per-order billing interval (2026-11-13).
--
-- Affiliate commission amortization and Finance revenue recognition need to
-- know whether a CHARGE pre-paid a month or a year. They used to read the
-- buyer's current subscription variant, so switching monthly to annual
-- relabelled earlier monthly orders. The Lemon Squeezy webhook now stamps each
-- order; older rows fall back to an amount rule in src/lib/order-interval.ts.
--
-- Safe to re-run. Apply by hand in the Supabase SQL editor (prod schema lags
-- migrations/); the code tolerates the column being missing until then.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_interval TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_billing_interval_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_billing_interval_check
      CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
  END IF;
END $$;
