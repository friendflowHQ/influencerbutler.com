-- Butler AI answer feedback: one row per thumbs up/down on an answer, from the
-- website bubble and the extension chat. Service-role only (deny-all RLS), same
-- pattern as ai_concierge_sessions. Migrations here are HAND-APPLIED in the
-- Supabase SQL editor - until this runs, the feedback route logs and returns ok
-- so the UI never breaks.

CREATE TABLE IF NOT EXISTS ai_concierge_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  surface     TEXT,
  rating      TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason      TEXT,
  question    TEXT,
  answer      TEXT,
  page        TEXT,
  locale      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_concierge_feedback_created
  ON ai_concierge_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_concierge_feedback_rating
  ON ai_concierge_feedback (rating, created_at DESC);

ALTER TABLE ai_concierge_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_concierge_feedback_no_anon ON ai_concierge_feedback;
CREATE POLICY ai_concierge_feedback_no_anon ON ai_concierge_feedback FOR ALL USING (false) WITH CHECK (false);
