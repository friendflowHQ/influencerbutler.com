-- Newsletter / email capture.
--
-- Stores people who opt in to the educational newsletter from the site footer,
-- blog posts, and the "not ready for a trial yet?" soft CTA. This is the local
-- record of truth; the subscribe route also best-effort adds the contact to a
-- Resend Audience (when RESEND_AUDIENCE_ID is set) so newsletters can be
-- composed and sent from the Resend dashboard, which handles unsubscribe links
-- and compliance for us.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the subscribe route. The route is
-- best-effort, so a missing table just means signups are not recorded until
-- this is applied.

CREATE TABLE IF NOT EXISTS email_subscribers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  source          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS email_subscribers_created_at_idx
  ON email_subscribers (created_at DESC);

-- Lock it down: only the service-role key (used by our server route) may read
-- or write. Browser anon / authenticated clients get nothing.
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
