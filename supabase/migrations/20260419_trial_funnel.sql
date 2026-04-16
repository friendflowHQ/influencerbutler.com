-- Trial conversion funnel
-- Tracks the 3-day free-trial email sequence and the unique Lemon Squeezy
-- discount codes minted when the trial starts (20% off monthly, 30% off
-- annual-switch). Codes are restricted in LS to their matching variant and
-- expire at trial_end + 1 day.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_discount_code_monthly TEXT,
  ADD COLUMN IF NOT EXISTS trial_discount_code_annual TEXT,
  ADD COLUMN IF NOT EXISTS ls_discount_id_monthly TEXT,
  ADD COLUMN IF NOT EXISTS ls_discount_id_annual TEXT,
  ADD COLUMN IF NOT EXISTS trial_email_day0_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_email_day1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_email_day2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_email_day3_sent_at TIMESTAMPTZ;

-- Let the cron find trial subscriptions with pending sends quickly.
CREATE INDEX IF NOT EXISTS subscriptions_trial_funnel_idx
  ON subscriptions (trial_started_at)
  WHERE status IN ('on_trial', 'active') AND trial_started_at IS NOT NULL;
