-- Trial conversion + discount redemption capture.
--
-- Two analytics gaps this closes:
--   1. trial_converted_at: nothing recorded when a trial became a paying
--      subscription (subscription_updated blindly overwrites status), so
--      trial-to-paid conversion was uncomputable. The webhook now stamps it
--      the first time a trial's status flips to active.
--   2. orders.discount_code / discount_total_cents: the order payload carries
--      discount_total but not the code; the webhook now stores the total and
--      best-effort resolves the code via the LS discount-redemptions API. This
--      is what lets the funnel report say which minted trial codes actually
--      got redeemed.
--
-- Backfill note: trials that are CURRENTLY paying are approximated as having
-- converted at trial end (start + 3 days). Historical trials that converted
-- and later cancelled are unrecoverable and will undercount slightly.
--
-- NOTE: prod schema is migrated by hand. Paste this file into the Supabase
-- SQL editor BEFORE deploying. If the order slips nothing breaks: the webhook
-- writes are best-effort and the report shows "migration pending".

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_total_cents INTEGER;

CREATE INDEX IF NOT EXISTS subscriptions_trial_converted_idx
  ON subscriptions (trial_converted_at) WHERE trial_converted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_discount_code_idx
  ON orders (discount_code) WHERE discount_code IS NOT NULL;

-- Approximate backfill for pre-migration cohorts (see note above).
UPDATE subscriptions
   SET trial_converted_at = trial_started_at + interval '3 days'
 WHERE trial_started_at IS NOT NULL
   AND trial_converted_at IS NULL
   AND status IN ('active', 'past_due');
