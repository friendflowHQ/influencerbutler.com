-- Server-side rollups for the admin Emails dashboard.
--
-- /api/admin/emails/summary and /api/admin/emails/timeseries used to page
-- every email_sends row in the window out to the app (100k+ rows a month from
-- the cold sequences) and count in JS, which took 10-30s and could hit the
-- statement timeout. These functions do the same counting with one GROUP BY
-- over the email_sends_created_at_idx range, so each call returns a few
-- hundred rows instead.
--
-- The routes call these via RPC and fall back to the old row scan while the
-- functions are missing, so deploying the code before this migration is safe.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this
-- whole file into the Supabase SQL editor and run it once. Safe to re-run.

-- Per (category, funnel) counts since p_since. Mirrors bump() in
-- src/app/api/admin/emails/summary/route.ts: status 'suppressed' / 'failed'
-- count as such, every other status counts as sent; each event column counts
-- when set. Empty category -> 'unknown', empty funnel -> 'transactional'.
CREATE OR REPLACE FUNCTION public.email_sends_summary(p_since TIMESTAMPTZ)
RETURNS TABLE (
  category   TEXT,
  funnel     TEXT,
  sent       INTEGER,
  suppressed INTEGER,
  failed     INTEGER,
  delivered  INTEGER,
  opened     INTEGER,
  clicked    INTEGER,
  bounced    INTEGER,
  complained INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(s.category, ''), 'unknown')                                        AS category,
    COALESCE(NULLIF(s.funnel, ''), 'transactional')                                    AS funnel,
    (COUNT(*) FILTER (WHERE s.status IS DISTINCT FROM 'suppressed'
                        AND s.status IS DISTINCT FROM 'failed'))::INTEGER              AS sent,
    (COUNT(*) FILTER (WHERE s.status = 'suppressed'))::INTEGER                         AS suppressed,
    (COUNT(*) FILTER (WHERE s.status = 'failed'))::INTEGER                             AS failed,
    COUNT(s.delivered_at)::INTEGER                                                     AS delivered,
    COUNT(s.opened_at)::INTEGER                                                        AS opened,
    COUNT(s.clicked_at)::INTEGER                                                       AS clicked,
    COUNT(s.bounced_at)::INTEGER                                                       AS bounced,
    COUNT(s.complained_at)::INTEGER                                                    AS complained
  FROM email_sends s
  WHERE s.created_at >= p_since
  GROUP BY 1, 2;
$$;

-- Per UTC day counts for rows created since p_since, optionally scoped (at
-- most one scope is expected). Mirrors the JS bucketing in
-- src/app/api/admin/emails/timeseries/route.ts: every row counts as sent on
-- its created_at day; each event counts on the day it happened. p_prefix
-- matches category LIKE p_prefix || '%', as the route always did.
CREATE OR REPLACE FUNCTION public.email_sends_daily(
  p_since        TIMESTAMPTZ,
  p_category     TEXT DEFAULT NULL,
  p_prefix       TEXT DEFAULT NULL,
  p_broadcast_id TEXT DEFAULT NULL,
  p_funnel       TEXT DEFAULT NULL
)
RETURNS TABLE (
  day       TEXT,
  sent      INTEGER,
  delivered INTEGER,
  opened    INTEGER,
  clicked   INTEGER,
  bounced   INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT s.created_at, s.delivered_at, s.opened_at, s.clicked_at, s.bounced_at
    FROM email_sends s
    WHERE s.created_at >= p_since
      AND (p_category IS NULL OR s.category = p_category)
      AND (p_prefix IS NULL OR s.category LIKE p_prefix || '%')
      AND (p_broadcast_id IS NULL OR s.broadcast_id = p_broadcast_id)
      AND (p_funnel IS NULL OR s.funnel = p_funnel)
  ),
  events AS (
    SELECT (created_at AT TIME ZONE 'UTC')::DATE AS d, 'sent'::TEXT AS m FROM scoped
    UNION ALL
    SELECT (delivered_at AT TIME ZONE 'UTC')::DATE, 'delivered' FROM scoped WHERE delivered_at IS NOT NULL
    UNION ALL
    SELECT (opened_at AT TIME ZONE 'UTC')::DATE, 'opened' FROM scoped WHERE opened_at IS NOT NULL
    UNION ALL
    SELECT (clicked_at AT TIME ZONE 'UTC')::DATE, 'clicked' FROM scoped WHERE clicked_at IS NOT NULL
    UNION ALL
    SELECT (bounced_at AT TIME ZONE 'UTC')::DATE, 'bounced' FROM scoped WHERE bounced_at IS NOT NULL
  )
  SELECT
    TO_CHAR(d, 'YYYY-MM-DD')                                AS day,
    (COUNT(*) FILTER (WHERE m = 'sent'))::INTEGER           AS sent,
    (COUNT(*) FILTER (WHERE m = 'delivered'))::INTEGER      AS delivered,
    (COUNT(*) FILTER (WHERE m = 'opened'))::INTEGER         AS opened,
    (COUNT(*) FILTER (WHERE m = 'clicked'))::INTEGER        AS clicked,
    (COUNT(*) FILTER (WHERE m = 'bounced'))::INTEGER        AS bounced
  FROM events
  GROUP BY d;
$$;

-- Admin-only: callable by the service role (createAdminClient), not by
-- signed-in users or the anon key.
REVOKE ALL ON FUNCTION public.email_sends_summary(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_sends_summary(TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.email_sends_daily(TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_sends_daily(TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Make PostgREST see the new functions immediately.
NOTIFY pgrst, 'reload schema';
