-- Pro welcome funnel (direct subscribers)
-- Customers who subscribe straight to a paid Pro plan come through Lemon
-- Squeezy as status 'active' (no free trial). They should NOT receive the
-- trial sequence ("your trial is live", "trial ends today", etc.). Instead
-- they get a Pro welcome + short nurture sequence. pro_started_at is the
-- anchor the affiliate-funnel cron measures the day0/day2/day5/day10 sends
-- against; it is set only on subscription_created when status = 'active'
-- (never on add-on subscriptions, never on trials).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pro_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_email_day0_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_email_day2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_email_day5_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_email_day10_sent_at TIMESTAMPTZ;

-- Let the cron find direct-subscriber rows with pending sends quickly.
CREATE INDEX IF NOT EXISTS subscriptions_pro_welcome_funnel_idx
  ON subscriptions (pro_started_at)
  WHERE status = 'active' AND pro_started_at IS NOT NULL;
