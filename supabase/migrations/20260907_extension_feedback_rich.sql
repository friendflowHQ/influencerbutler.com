-- Rich feedback from the extension's in-page chat bubble (desktop parity):
-- adds a title, a diagnostic log blob, and screenshots to extension_feedback,
-- and widens the type set to include 'question'. The bubble's Report view posts
-- these through /api/extension/feedback (the same endpoint the popup uses).
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase SQL
-- editor. Until it is applied, the extra columns are absent; the insert in
-- /api/extension/feedback would fail on them, so apply this before shipping the
-- bubble to users. (The minimal popup form still works either way.)
--
-- Screenshots are stored inline as a JSONB array of { base64, mime, filename }.
-- The API caps count (6), per-image size, and total size before insert, so a row
-- stays bounded; Postgres TOASTs the JSONB out of line.

ALTER TABLE extension_feedback ADD COLUMN IF NOT EXISTS title       TEXT;
ALTER TABLE extension_feedback ADD COLUMN IF NOT EXISTS logs        TEXT;
ALTER TABLE extension_feedback ADD COLUMN IF NOT EXISTS screenshots JSONB;

-- Widen the type CHECK to include 'question'. The original inline constraint is
-- named by Postgres convention <table>_<column>_check; drop-if-exists then re-add.
ALTER TABLE extension_feedback DROP CONSTRAINT IF EXISTS extension_feedback_feedback_type_check;
ALTER TABLE extension_feedback
  ADD CONSTRAINT extension_feedback_feedback_type_check
  CHECK (feedback_type IN ('bug','feature','question','praise','other'));
