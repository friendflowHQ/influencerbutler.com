-- Per-customer setup snapshot reported by the desktop app (src/app/api/me/setup-snapshot).
-- One row per customer: which REQUIRED setup steps each butler still lacks, by name only
-- (no keys, emails or URLs). The booking page and POST /api/booking/create read it to check
-- a customer's setup before a 1:1 call instead of trusting a checkbox (src/lib/setup-snapshot.ts).
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor (project
-- khutiiojhafblabtixpp) BEFORE deploying the code. Until it is applied the routes fail open
-- (no snapshot means the booking page falls back to the checklist checkboxes).
-- Service-role-only (deny-all RLS), like call_bookings.

CREATE TABLE IF NOT EXISTS setup_snapshots (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE setup_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS setup_snapshots_no_anon ON setup_snapshots;
CREATE POLICY setup_snapshots_no_anon ON setup_snapshots FOR ALL USING (false) WITH CHECK (false);
