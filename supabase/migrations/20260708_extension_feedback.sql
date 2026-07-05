-- Feedback Butler for the Chrome extension: bug reports, feature requests,
-- and general notes submitted from the extension popup.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, POST /api/extension/feedback responds with
-- migrationPending and the extension keeps the message and retries.
--
-- Service-role only (RLS enabled, zero policies), same as the other
-- extension_* tables: writes go through /api/extension/feedback after optional
-- license auth. user_id/email are attached only when the user has connected a
-- license key; anonymous feedback is allowed on purpose, because the free
-- extension is used by people who never sign in and their feedback matters
-- most.
CREATE TABLE IF NOT EXISTS extension_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT,
  feedback_type TEXT NOT NULL DEFAULT 'other'
                CHECK (feedback_type IN ('bug','feature','praise','other')),
  message       TEXT NOT NULL,
  page_url      TEXT,
  ext_version   TEXT,
  browser       TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','reviewed','resolved')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extension_feedback_recent_idx
  ON extension_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS extension_feedback_user_idx
  ON extension_feedback (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE extension_feedback ENABLE ROW LEVEL SECURITY;
