-- Weekly recurring protected blocks for call scheduling. These are always-on
-- owner holds (deep-work focus time, standing personal commitments) that repeat
-- every week, unlike the one-off ranges in call_blocks. The engine expands each
-- row across the booking horizon into busy ranges, so overlapping slots never
-- appear. Complements the Google Calendar free/busy sync: use these for the few
-- fixed blocks you want guaranteed regardless of what is on the calendar.
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Service-role only (deny-all RLS), mirroring the
-- other call_* tables.

CREATE TABLE IF NOT EXISTS call_recurring_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday    INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun..6=Sat
  start_min  INT NOT NULL,                                  -- minutes from local midnight
  end_min    INT NOT NULL,
  timezone   TEXT NOT NULL,                                 -- IANA, e.g. America/Denver
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_min > start_min)
);
CREATE INDEX IF NOT EXISTS idx_call_recurring_blocks_weekday ON call_recurring_blocks(weekday);

ALTER TABLE call_recurring_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_recurring_blocks_no_anon ON call_recurring_blocks;
CREATE POLICY call_recurring_blocks_no_anon ON call_recurring_blocks FOR ALL USING (false) WITH CHECK (false);
