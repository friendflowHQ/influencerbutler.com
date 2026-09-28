-- Links a Chrome-extension feedback row to its ticket in the feedback Worker
-- (D1) support inbox, so we never file the same feedback twice. New actionable
-- extension feedback is mirrored into D1 on submit
-- (src/app/api/extension/feedback/route.ts), and the one-time backlog is filed
-- by POST /api/admin/extension-feedback/backfill-d1. Both stamp this column with
-- the resulting fb-<uuid> ticket id; a NULL value means "not yet in the D1
-- support inbox". The backfill only ever touches NULL rows, so it is safe to
-- run repeatedly.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase SQL
-- editor. Until it is applied, the on-submit mirror still files the ticket but
-- cannot record the link, and the backfill detects the missing column and
-- reports migrationPending rather than erroring.

ALTER TABLE extension_feedback ADD COLUMN IF NOT EXISTS d1_ticket_id TEXT;
CREATE INDEX IF NOT EXISTS idx_extension_feedback_d1_ticket ON extension_feedback(d1_ticket_id);
