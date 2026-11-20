-- Support dashboard: internal notes, ticket assignee, and stored bot drafts.
-- The tickets themselves live in the feedback Worker (D1); these tables hold the
-- human-side data keyed by the Worker's ticket id ("fb-..."), so no Worker
-- deploy is needed. Service-role only (deny-all RLS), same pattern as
-- ai_concierge_feedback. HAND-APPLIED in the Supabase SQL editor: until it runs
-- the dashboard shows a "run the migration" hint and everything else keeps working.
-- Idempotent: safe to re-run.

-- Internal notes: never emailed, never shown to customers, never touched by bots.
CREATE TABLE IF NOT EXISTS support_ticket_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket
  ON support_ticket_notes (ticket_id, created_at);

-- One row per assigned ticket. Deleting the row means unassigned.
CREATE TABLE IF NOT EXISTS support_ticket_assignments (
  ticket_id      TEXT PRIMARY KEY,
  assignee_email TEXT NOT NULL,
  assigned_by    TEXT,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_assignments_assignee
  ON support_ticket_assignments (assignee_email);

-- Drafts the auto-reply sweep wrote but did not send (shadow mode, or the
-- per-run send cap was hit). A human approves (sends, optionally edited) or
-- rejects each one; the outcome is the quality signal for turning the sweep live.
-- status: pending | sent | edited_sent | rejected | superseded
CREATE TABLE IF NOT EXISTS support_bot_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      TEXT NOT NULL,
  title          TEXT,
  customer_email TEXT,
  priority       TEXT,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  confidence     NUMERIC,
  grounded       BOOLEAN NOT NULL DEFAULT false,
  classification TEXT,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'edited_sent', 'rejected', 'superseded')),
  reject_reason  TEXT,
  resolved_by    TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_bot_drafts_status
  ON support_bot_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_bot_drafts_ticket
  ON support_bot_drafts (ticket_id, created_at DESC);

ALTER TABLE support_ticket_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_ticket_notes_no_anon ON support_ticket_notes;
CREATE POLICY support_ticket_notes_no_anon ON support_ticket_notes FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE support_ticket_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_ticket_assignments_no_anon ON support_ticket_assignments;
CREATE POLICY support_ticket_assignments_no_anon ON support_ticket_assignments FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE support_bot_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_bot_drafts_no_anon ON support_bot_drafts;
CREATE POLICY support_bot_drafts_no_anon ON support_bot_drafts FOR ALL USING (false) WITH CHECK (false);
