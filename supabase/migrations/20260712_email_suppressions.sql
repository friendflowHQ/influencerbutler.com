-- Email suppression list for marketing / funnel emails.
--
-- Any address in this table is skipped by the direct-send Resend path: the
-- trial sequence, the pro-welcome sequence, affiliate conversion offers, and
-- the day-45 testimonial ask. It is populated when a recipient clicks the
-- "Unsubscribe" link in one of those emails (/api/email/unsubscribe) or uses
-- the native one-click Unsubscribe button in Gmail / Apple Mail. Rows can also
-- be added by hand for hard bounces or spam complaints.
--
-- Transactional mail (magic links, license keys, purchase receipts, staff
-- invites, commission statements) does NOT consult this list: those messages
-- are required for a paid account to function and are not marketing, so they
-- carry no unsubscribe link and always send.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the unsubscribe route. The send path
-- is best-effort: a missing table just means the suppression check finds
-- nothing (fails open) until this is applied.

CREATE TABLE IF NOT EXISTS email_suppressions (
  email       TEXT PRIMARY KEY,          -- always stored lowercased + trimmed
  reason      TEXT NOT NULL DEFAULT 'unsubscribe', -- unsubscribe | bounce | complaint | manual
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_suppressions_created_at_idx
  ON email_suppressions (created_at DESC);

-- Lock it down: only the service-role key (used by our server routes) may read
-- or write. Browser anon / authenticated clients get nothing.
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
