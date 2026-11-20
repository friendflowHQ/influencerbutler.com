-- Butler AI search misses: every search_help call that matched no guide (or only
-- weakly), so the owner can see which topics need a new tutorial or video.
-- Service-role only (deny-all RLS). HAND-APPLIED in the Supabase SQL editor;
-- until it runs, inserts fail quietly (logged) and nothing breaks.

CREATE TABLE IF NOT EXISTS ai_concierge_search_misses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query       TEXT NOT NULL,
  confidence  TEXT NOT NULL CHECK (confidence IN ('none', 'low')),
  surface     TEXT,
  locale      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_concierge_search_misses_created
  ON ai_concierge_search_misses (created_at DESC);

ALTER TABLE ai_concierge_search_misses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_concierge_search_misses_no_anon ON ai_concierge_search_misses;
CREATE POLICY ai_concierge_search_misses_no_anon ON ai_concierge_search_misses FOR ALL USING (false) WITH CHECK (false);
