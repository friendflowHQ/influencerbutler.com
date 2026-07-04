-- Course progress "save and resume" for the free interactive courses
-- (/course/amazon-influencer). localStorage is the primary store; a visitor
-- can optionally save progress against their email and get a resume link
-- back by email. Lookup is by resume_token only (never by email) so the
-- endpoint cannot be used to enumerate subscribers.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the /api/course/progress route.
-- The route is best-effort: a missing table means "save my progress" degrades
-- gracefully while everything else keeps working on localStorage.

CREATE TABLE IF NOT EXISTS course_progress (
  email        TEXT NOT NULL,
  series       TEXT NOT NULL,
  progress     JSONB NOT NULL,
  resume_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, series)
);

CREATE UNIQUE INDEX IF NOT EXISTS course_progress_resume_token_idx
  ON course_progress (resume_token);

-- Lock it down: only the service-role key (used by our server route) may read
-- or write. Browser anon / authenticated clients get nothing.
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
