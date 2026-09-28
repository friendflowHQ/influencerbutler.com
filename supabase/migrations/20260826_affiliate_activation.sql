-- Dormant-affiliate activation drip.
-- A daily cron (/api/cron/affiliate-activation) nudges approved affiliates who
-- have not driven a single referred order ("dormant", $0 earned):
--   day 7  after approval  -> the swipe-kit activation email
--   day 21 after approval  -> gift a 30-day free-Pro comp + "on us, go get going"
-- Each step is sent at most once per affiliate, tracked by its own sent-at
-- column here (same idempotency pattern as the conversion drip's
-- conversion_email_{1h,3d,5d}_sent_at columns in 20260417_affiliate_funnel.sql).
--
-- Additive and idempotent. Anchored on affiliate_applications.reviewed_at
-- (the approval timestamp).

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS activation_email_day7_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_comp_day21_sent_at TIMESTAMPTZ;
