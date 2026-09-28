-- Free-app onboarding drip.
--
-- Turns the ~1,100/mo anonymous desktop-app downloads into an owned, nurtured
-- list. The /downloading interstitial now offers a no-friction email capture
-- ("get your setup guide + pro tips"); those addresses land in email_subscribers
-- with source = 'download-app', and the affiliate-funnel cron sends them a short
-- day0/day2/day5/day10 onboarding drip that walks them from install to first
-- win to a Pro upgrade. The same rows also seed the newsletter audience.
--
-- We extend the existing email_subscribers table rather than add a new one, so
-- the download-capture list and the newsletter list are one list.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying. The onboarding cron step is written
-- to no-op safely (it catches the "column does not exist" error and returns
-- zero) until these columns exist, so shipping the code first is harmless.

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS onboarding_email_day0_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_email_day2_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_email_day5_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_email_day10_sent_at TIMESTAMPTZ,
  -- Set once we notice the address became a trial/paid customer, so the
  -- free-app nurture stops (a paying user should not get "install the app").
  ADD COLUMN IF NOT EXISTS onboarding_converted_at        TIMESTAMPTZ;

-- The cron pulls download-app rows that are still maturing through the drip and
-- have not yet converted. A partial index keeps that scan cheap as the list grows.
CREATE INDEX IF NOT EXISTS email_subscribers_onboarding_idx
  ON email_subscribers (created_at)
  WHERE source = 'download-app' AND onboarding_converted_at IS NULL;
