-- App-trial nurture drip.
--
-- People who install the desktop app and type their email into the startup
-- walkthrough. Until now that address went to the licensing worker's LEADS_KV
-- and was forwarded to a lifecycle worker that was never deployed, so an
-- app-trial user received no email at all: their 14-day trial simply ended and
-- the app locked. These rows land in email_subscribers with
-- source = 'app-trial', and the affiliate-funnel cron drips them from welcome
-- through the trial-ending nudge and on into a short lapsed tail.
--
-- Same approach as 20260813_free_onboarding_funnel.sql: extend
-- email_subscribers rather than add a table, so every owned address stays on
-- one list with one suppression path.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying. The cron step catches the
-- "column does not exist" error and returns zero until these exist, so
-- shipping the code first is harmless.

ALTER TABLE email_subscribers
  -- When the app was installed, which is what the drip is timed from. NOT
  -- created_at: a visitor who joined the newsletter months ago and installs
  -- today would otherwise mature straight into the lapsed tail. Set once and
  -- never reset, so a reinstall cannot restart the sequence.
  ADD COLUMN IF NOT EXISTS app_trial_started_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day0_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day1_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day3_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day5_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day7_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day10_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day12_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day14_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day17_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day21_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_trial_email_day30_sent_at TIMESTAMPTZ,
  -- Stamped once the address becomes a trial/paid customer, so the nurture
  -- stops rather than telling a paying user their trial is ending.
  ADD COLUMN IF NOT EXISTS app_trial_converted_at        TIMESTAMPTZ,
  -- Consecutive failed sends. Past the cap the lead is parked below so one
  -- permanently undeliverable address cannot hog the per-run budget forever.
  ADD COLUMN IF NOT EXISTS app_trial_send_failures       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_trial_abandoned_at        TIMESTAMPTZ;

-- The cron pulls app-trial rows still maturing through the drip that have not
-- converted or been parked. A partial index keeps that scan cheap as the list
-- grows.
CREATE INDEX IF NOT EXISTS email_subscribers_app_trial_idx
  ON email_subscribers (app_trial_started_at)
  WHERE app_trial_started_at IS NOT NULL
    AND app_trial_converted_at IS NULL
    AND app_trial_abandoned_at IS NULL;
