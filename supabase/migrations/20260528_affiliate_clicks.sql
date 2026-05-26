-- Per-click tracking for branded affiliate share links.
--
-- One row per /dashboard/subscription?code=XYZ landing (dedup'd to one row per
-- 30-min window per code via an ib_aff_click_{code} cookie on the client).
-- Writes go through /api/promo/touch with the service-role key. Reads go
-- through the affiliate_clicks_stats() RPC scoped to the caller's own
-- profiles.affiliate_code, so an affiliate can only see their own clicks.

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id              BIGSERIAL PRIMARY KEY,
  affiliate_code  TEXT NOT NULL,
  ls_affiliate_id TEXT,
  source          TEXT,
  referrer_host   TEXT,
  user_agent      TEXT,
  ip_country      TEXT,
  is_bot          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_code_created_idx
  ON affiliate_clicks (affiliate_code, created_at DESC);

CREATE INDEX IF NOT EXISTS affiliate_clicks_code_source_idx
  ON affiliate_clicks (affiliate_code, source, created_at DESC);

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated cannot read or write directly. Service role bypasses RLS
-- for the touch endpoint insert; reads happen via the SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "affiliate_clicks_no_anon" ON affiliate_clicks;
CREATE POLICY "affiliate_clicks_no_anon" ON affiliate_clicks
  FOR ALL USING (false) WITH CHECK (false);


-- Aggregate stats for the caller's branded code, optionally filtered to a
-- time window. Returns a JSON object with total + breakdowns + daily series,
-- plus the total for the previous same-length window for trend calculation.
-- Excludes bot traffic from all counts.
CREATE OR REPLACE FUNCTION affiliate_clicks_stats(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_window_seconds NUMERIC;
  v_prev_from TIMESTAMPTZ;
  v_prev_to   TIMESTAMPTZ;
  v_total INTEGER;
  v_prev_total INTEGER;
  v_by_source JSONB;
  v_by_referrer JSONB;
  v_by_country JSONB;
  v_by_day JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT UPPER(affiliate_code)
    INTO v_code
    FROM profiles
   WHERE id = auth.uid()
     AND affiliate_code IS NOT NULL
   LIMIT 1;

  IF v_code IS NULL THEN
    -- Affiliate without a branded code yet: return empty shape rather than error.
    RETURN jsonb_build_object(
      'total', 0,
      'prevTotal', 0,
      'bySource', '[]'::jsonb,
      'byReferrer', '[]'::jsonb,
      'byCountry', '[]'::jsonb,
      'byDay', '[]'::jsonb
    );
  END IF;

  v_window_seconds := GREATEST(EXTRACT(EPOCH FROM (p_to - p_from)), 1);
  v_prev_to   := p_from;
  v_prev_from := p_from - (v_window_seconds || ' seconds')::INTERVAL;

  SELECT COUNT(*) INTO v_total
    FROM affiliate_clicks
   WHERE UPPER(affiliate_code) = v_code
     AND is_bot = false
     AND created_at >= p_from
     AND created_at <  p_to;

  SELECT COUNT(*) INTO v_prev_total
    FROM affiliate_clicks
   WHERE UPPER(affiliate_code) = v_code
     AND is_bot = false
     AND created_at >= v_prev_from
     AND created_at <  v_prev_to;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb)
    INTO v_by_source
    FROM (
      SELECT jsonb_build_object(
               'source', COALESCE(source, 'other'),
               'count', COUNT(*)::int
             ) AS row
        FROM affiliate_clicks
       WHERE UPPER(affiliate_code) = v_code
         AND is_bot = false
         AND created_at >= p_from
         AND created_at <  p_to
       GROUP BY COALESCE(source, 'other')
    ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb)
    INTO v_by_referrer
    FROM (
      SELECT jsonb_build_object(
               'host', referrer_host,
               'count', COUNT(*)::int
             ) AS row
        FROM affiliate_clicks
       WHERE UPPER(affiliate_code) = v_code
         AND is_bot = false
         AND referrer_host IS NOT NULL
         AND referrer_host <> ''
         AND created_at >= p_from
         AND created_at <  p_to
       GROUP BY referrer_host
       ORDER BY COUNT(*) DESC
       LIMIT 10
    ) r;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb)
    INTO v_by_country
    FROM (
      SELECT jsonb_build_object(
               'country', ip_country,
               'count', COUNT(*)::int
             ) AS row
        FROM affiliate_clicks
       WHERE UPPER(affiliate_code) = v_code
         AND is_bot = false
         AND ip_country IS NOT NULL
         AND ip_country <> ''
         AND created_at >= p_from
         AND created_at <  p_to
       GROUP BY ip_country
       ORDER BY COUNT(*) DESC
       LIMIT 10
    ) c;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date' ASC), '[]'::jsonb)
    INTO v_by_day
    FROM (
      SELECT jsonb_build_object(
               'date', to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
               'count', COUNT(*)::int
             ) AS row
        FROM affiliate_clicks
       WHERE UPPER(affiliate_code) = v_code
         AND is_bot = false
         AND created_at >= p_from
         AND created_at <  p_to
       GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')
    ) d;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'prevTotal', COALESCE(v_prev_total, 0),
    'bySource', v_by_source,
    'byReferrer', v_by_referrer,
    'byCountry', v_by_country,
    'byDay', v_by_day
  );
END;
$$;

REVOKE ALL ON FUNCTION affiliate_clicks_stats(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION affiliate_clicks_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
