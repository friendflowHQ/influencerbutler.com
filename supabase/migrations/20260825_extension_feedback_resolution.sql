-- Resolution metadata for extension_feedback, so the extension's post-update
-- "What's New" notice can show a signed-in user their own bug reports that we
-- have since fixed ("issues you reported that we fixed").
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase SQL
-- editor. Until it is applied, GET /api/extension/feedback/resolved soft-fails
-- as migrationPending and the notice simply shows its changelog highlights.
--
-- The status column already exists with values ('new','reviewed','resolved')
-- from 20260708_extension_feedback.sql; a row is announced once status is
-- 'resolved' AND resolved_version is set to the version that shipped the fix.
ALTER TABLE extension_feedback
  ADD COLUMN IF NOT EXISTS resolved_version TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at      TIMESTAMPTZ,
  -- Short, customer-facing summary of the fix. When null, the notice falls back
  -- to the user's original message.
  ADD COLUMN IF NOT EXISTS resolution_note  TEXT;

-- Fast lookup of one user's resolved reports (the read endpoint's query).
CREATE INDEX IF NOT EXISTS extension_feedback_resolved_idx
  ON extension_feedback (user_id, resolved_version)
  WHERE status = 'resolved' AND user_id IS NOT NULL;
