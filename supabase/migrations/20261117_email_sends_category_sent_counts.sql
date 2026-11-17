-- All-time sent count per email_sends category, for the admin Sequences list.
--
-- /api/admin/emails/sequences used to compute each sequence's lifetime "sent"
-- total by paging every matching email_sends row (200k+ from the cold
-- sequences) out to the app with OFFSET pagination. That request ran for 60-80s
-- and kept the database busy enough that the Emails page's summary and sends
-- queries hit the statement timeout ("Email stats could not load this time").
-- This function does the same count with one GROUP BY over
-- email_sends_category_idx and returns one row per category.
--
-- The route calls it via RPC and falls back to per-category count(*) queries
-- while it is missing, so deploying the code before this migration is safe.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this
-- whole file into the Supabase SQL editor and run it once. Safe to re-run.

-- Mirrors the route's old filter: .not("status", "in", "(suppressed,failed)"),
-- i.e. SQL `status NOT IN ('suppressed', 'failed')` (a NULL status is excluded).
CREATE OR REPLACE FUNCTION public.email_sends_category_sent_counts(p_categories TEXT[])
RETURNS TABLE (
  category TEXT,
  sent     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.category, COUNT(*)::BIGINT AS sent
  FROM email_sends s
  WHERE s.category = ANY (p_categories)
    AND s.status NOT IN ('suppressed', 'failed')
  GROUP BY s.category;
$$;

REVOKE ALL ON FUNCTION public.email_sends_category_sent_counts(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_sends_category_sent_counts(TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
