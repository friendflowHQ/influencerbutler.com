-- Covering index for the admin Emails 30-day stats.
--
-- email_sends_summary and email_sends_daily (20261111) aggregate every row in
-- the selected window (~125k rows for 30 days). They find those rows through
-- email_sends_created_at_idx but then read each one from the heap for its
-- category, status and event columns. On this database that random heap read
-- is the slow part: 3-9s per call, and past the 8s authenticator
-- statement_timeout when the Emails page's panels load together.
--
-- This index carries every column those two functions read, so the planner can
-- answer them with an index-only scan (~30 MB) instead. The admin streams
-- breakdown now reuses email_sends_summary, so it benefits too.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this whole
-- file into the Supabase SQL editor and run it once. Safe to re-run. The build
-- takes a few seconds and briefly holds inserts into email_sends.
--
-- AFTERWARDS, run this on its own as a separate query (VACUUM cannot run inside
-- the editor's transaction). It marks pages all-visible so the index-only scan
-- skips the heap:
--     VACUUM (ANALYZE) public.email_sends;

CREATE INDEX IF NOT EXISTS email_sends_created_cover_idx
  ON public.email_sends (created_at)
  INCLUDE (category, funnel, status, broadcast_id,
           delivered_at, opened_at, clicked_at, bounced_at, complained_at);
