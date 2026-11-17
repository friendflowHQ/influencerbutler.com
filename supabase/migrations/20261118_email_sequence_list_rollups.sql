-- Make the admin Sequences list cheap enough to load alongside the Emails stats.
--
-- Diagnosed 2026-11-17: PostgREST runs as `authenticator` with an 8s
-- statement_timeout. email_sends_category_sent_counts (20261117) had to visit
-- ~220k heap rows of the 296k-row / 159 MB email_sends table to check status,
-- because the only category index is (category, created_at). It ran past 8s and
-- was cancelled, so every sequence's "sent" total came back empty. The
-- enrollment tally also paged ~74k rows out to the app 1,000 at a time.
--
-- 1. (category, status) index: the sent count becomes an index-only scan over a
--    few MB instead of a heap walk.
-- 2. email_sequence_enrollment_rollup: one GROUP BY replaces the 75-request
--    enrollment scan in /api/admin/emails/sequences.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this whole
-- file into the Supabase SQL editor and run it once. Safe to re-run. The index
-- build takes a few seconds and briefly holds inserts into email_sends.
--
-- AFTERWARDS, run this on its own as a separate query (VACUUM cannot run inside
-- the editor's transaction). It marks pages all-visible so the new index is
-- read without heap visits:
--     VACUUM (ANALYZE) public.email_sends;

CREATE INDEX IF NOT EXISTS email_sends_category_status_idx
  ON public.email_sends (category, status);

-- Conversion columns from 20260906_sequence_conversions.sql; repeated here so
-- the function below compiles even if that migration was never applied.
ALTER TABLE public.email_sequence_enrollments
  ADD COLUMN IF NOT EXISTS converted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_step INT;

-- One row per (sequence, state, open step, converted step) bucket. Mirrors the
-- JS tally in /api/admin/emails/sequences:
--   state       'cancelled' if cancelled_at, else 'completed' if completed_at,
--               else 'open'
--   last_step   for open rows only: last_step_sent (the step they are parked on)
--   conv_step   for converted rows only: COALESCE(converted_step, 0)
--   n           rows in the bucket
--   min_enrolled_at  earliest enrolled_at (open rows), for the next-send time;
--               nextSendTime() never decreases as enrolled_at grows, so the
--               earliest enrollee in a bucket is always due first.
CREATE OR REPLACE FUNCTION public.email_sequence_enrollment_rollup(p_sequence_ids UUID[])
RETURNS TABLE (
  sequence_id     UUID,
  state           TEXT,
  last_step       INTEGER,
  conv_step       INTEGER,
  n               INTEGER,
  min_enrolled_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.sequence_id,
    CASE
      WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN e.completed_at IS NOT NULL THEN 'completed'
      ELSE 'open'
    END                                                              AS state,
    CASE WHEN e.cancelled_at IS NULL AND e.completed_at IS NULL
         THEN COALESCE(e.last_step_sent, 0) END                      AS last_step,
    CASE WHEN e.converted_at IS NOT NULL
         THEN COALESCE(e.converted_step, 0) END                      AS conv_step,
    COUNT(*)::INTEGER                                                AS n,
    MIN(e.enrolled_at)                                               AS min_enrolled_at
  FROM email_sequence_enrollments e
  WHERE e.sequence_id = ANY (p_sequence_ids)
  GROUP BY 1, 2, 3, 4;
$$;

REVOKE ALL ON FUNCTION public.email_sequence_enrollment_rollup(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_sequence_enrollment_rollup(UUID[]) TO service_role;

NOTIFY pgrst, 'reload schema';
