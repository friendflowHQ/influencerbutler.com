-- Trial conversion funnel: extend the drip from 3 to 14 days.
-- The trial was extended to 14 days (matching the Lemon Squeezy Pro SKU trial
-- period). The email drip in /api/cron/affiliate-funnel now sends 6 touches:
-- day0 (welcome), day1 (activation), day3 (momentum), day7 (halfway),
-- day13 ("24 hours left"), day14 ("ends tonight"). day0/day1/day3 reuse their
-- existing columns; the three new touches need their own sent-at columns.
--
-- Additive and idempotent. The legacy trial_email_day2_sent_at column from
-- 20260419_trial_funnel.sql is left in place (now unused) to avoid disturbing
-- any in-flight rows; it can be dropped in a later cleanup once no row relies
-- on it.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_email_day7_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_email_day13_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_email_day14_sent_at TIMESTAMPTZ;
