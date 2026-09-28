-- Onboarding drip: stop the infinite retry on undeliverable addresses.
--
-- The affiliate-funnel cron stamped an onboarding tier's sent_at ONLY on a
-- successful send, so a lead whose address Resend rejects was re-picked and
-- re-sent every run, forever. In prod a single dead address logged 5,251 failed
-- sends over 9 days (~580/day): wasted Resend calls, junk email_sends rows, and
-- repeatedly hitting an invalid address (a sender-reputation risk that degrades
-- deliverability of good mail).
--
-- Track consecutive failures per lead and mark it abandoned once it crosses a
-- small cap, so it leaves the drip pool. Transient failures still retry; a later
-- successful send resets the counter.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE (or with) deploying. The onboarding cron step
-- no-ops safely (it catches "column does not exist" and returns zero) until
-- these columns exist, so shipping the code first is harmless.

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS onboarding_send_failures INT NOT NULL DEFAULT 0,
  -- Set once repeated sends keep failing, so the drip stops picking this lead.
  ADD COLUMN IF NOT EXISTS onboarding_abandoned_at  TIMESTAMPTZ;

-- Keep the cron's pool scan cheap: it now also excludes abandoned leads.
CREATE INDEX IF NOT EXISTS email_subscribers_onboarding_active_idx
  ON email_subscribers (created_at)
  WHERE source = 'download-app'
    AND onboarding_converted_at IS NULL
    AND onboarding_abandoned_at IS NULL;
