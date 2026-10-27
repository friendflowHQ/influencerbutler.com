-- Self-serve "pause instead of cancel": records when a paused subscription is
-- due to resume billing. Set by /api/subscription/{pause,resume} and kept in
-- sync by the subscription_paused/subscription_resumed LS webhooks.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pause_resumes_at TIMESTAMPTZ;
