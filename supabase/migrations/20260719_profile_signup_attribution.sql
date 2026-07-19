-- Free-signup affiliate attribution on profiles, powering the affiliate
-- dashboard "Referred signups" funnel. Stamped first-touch at account
-- creation from the ib_aff_src cookie (30-day, first-touch). Users
-- provisioned by the LS webhook (guest checkout) are intentionally NOT
-- stamped here: they already carry order/subscription attribution and are
-- not "free signups".
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this
-- into the Supabase SQL editor BEFORE deploying. If the order slips nothing
-- breaks: the capture helper warns and skips, and the funnel endpoint
-- returns migrationPending so the dashboard shows a friendly placeholder.
--
-- ALSO apply 20260618_pro_welcome_funnel.sql if it hasn't been: a live probe
-- on 2026-07-19 found prod missing subscriptions.pro_started_at, which the
-- funnel endpoint selects (it degrades to a reduced select, but the direct-Pro
-- event feed needs the column).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ref_affiliate_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS ref_affiliate_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS ref_captured_at TIMESTAMPTZ NULL;

-- Funnel counts filter profiles by the referring affiliate.
CREATE INDEX IF NOT EXISTS profiles_ref_affiliate_idx
  ON profiles (ref_affiliate_user_id)
  WHERE ref_affiliate_user_id IS NOT NULL;

-- Missing since 20260702_subscription_attribution: the funnel also scans
-- subscriptions by referrer.
CREATE INDEX IF NOT EXISTS subscriptions_ref_affiliate_idx
  ON subscriptions (ref_affiliate_user_id)
  WHERE ref_affiliate_user_id IS NOT NULL;
