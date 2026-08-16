-- Unified per-send email log + delivery/engagement status.
--
-- One row per email the app sends through Resend (marketing funnels AND
-- transactional mail), written best-effort by the shared sendEmail() helper
-- (src/lib/email-send.ts). Delivery, open, click, bounce, and complaint
-- timestamps are filled in later by the Resend webhook
-- (/api/webhooks/resend), matched on resend_id. Newsletter broadcast
-- recipients have no row at send time (broadcasts are sent server-side by
-- Resend); the webhook inserts their rows on the fly, tagged with
-- broadcast_id, which is what gives per-recipient newsletter visibility.
--
-- Suppressed skips (address on email_suppressions) are logged with
-- status = 'suppressed' so they are finally distinguishable from real sends.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the email-send refactor. Logging is
-- best-effort: a missing table just means no rows; sends are unaffected.

CREATE TABLE IF NOT EXISTS email_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_id     TEXT,                    -- Resend email id; NULL for suppressed/failed rows
  broadcast_id  TEXT,                    -- set for newsletter broadcast recipients
  recipient     TEXT NOT NULL,           -- always stored lowercased + trimmed
  subject       TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL,           -- e.g. 'trial_day0', 'login_link', 'newsletter'
  funnel        TEXT NOT NULL DEFAULT 'transactional',
                -- trial | pro | conversion | onboarding | winback | newsletter | transactional
  status        TEXT NOT NULL DEFAULT 'sent',  -- sent | suppressed | failed
  delivered_at  TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,             -- first open only
  clicked_at    TIMESTAMPTZ,             -- first click only
  bounced_at    TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The webhook looks rows up by resend_id; unique so its insert-if-missing path
-- can race the send-time insert without producing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS email_sends_resend_id_key
  ON email_sends (resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_sends_created_at_idx ON email_sends (created_at DESC);
CREATE INDEX IF NOT EXISTS email_sends_recipient_idx  ON email_sends (recipient);
CREATE INDEX IF NOT EXISTS email_sends_category_idx   ON email_sends (category, created_at DESC);
CREATE INDEX IF NOT EXISTS email_sends_broadcast_idx  ON email_sends (broadcast_id) WHERE broadcast_id IS NOT NULL;

-- Lock it down: only the service-role key (used by our server routes) may read
-- or write. Browser anon / authenticated clients get nothing.
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
