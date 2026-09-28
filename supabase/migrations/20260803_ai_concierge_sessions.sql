-- Butler AI concierge: one row per instant AI demo/support session, so the owner
-- can review what customers asked and follow up. Service-role only (deny-all
-- RLS), same pattern as call_config. Migrations here are HAND-APPLIED in the
-- Supabase SQL editor - after adding this, actually run it and confirm the table
-- exists in prod.

CREATE TABLE IF NOT EXISTS ai_concierge_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  user_email  TEXT,
  mode        TEXT NOT NULL DEFAULT 'voice' CHECK (mode IN ('voice', 'text')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  transcript  TEXT,
  summary     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent adds so re-running (or an earlier partial run) is safe.
ALTER TABLE ai_concierge_sessions ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE ai_concierge_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'voice';
ALTER TABLE ai_concierge_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE ai_concierge_sessions ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE ai_concierge_sessions ADD COLUMN IF NOT EXISTS summary JSONB;

-- Count today's sessions per user quickly (the daily-cap check).
CREATE INDEX IF NOT EXISTS ai_concierge_sessions_user_started
  ON ai_concierge_sessions (user_id, started_at DESC);

ALTER TABLE ai_concierge_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_concierge_sessions_no_anon ON ai_concierge_sessions;
CREATE POLICY ai_concierge_sessions_no_anon ON ai_concierge_sessions FOR ALL USING (false) WITH CHECK (false);
