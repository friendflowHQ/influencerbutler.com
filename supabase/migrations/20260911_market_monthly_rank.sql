-- Seasonality (Track 1.4): per-calendar-month sales-rank buckets for the
-- extension's "Peaks in Nov-Dec" / "Steady all year" chip.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, GET /api/extension/market?seasonality=1
-- simply omits the `monthly` field (the route logs a warning and returns the
-- rest of the payload unchanged), and the extension falls back to the desktop
-- app's own rank history for the chip.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, safe to re-run.
--
-- Reads product_market_history (the append-only pooled observation log from
-- 20260819_product_market_history.sql): asin, marketplace, captured_at,
-- bsr_rank. For each requested ASIN it returns one row per UTC calendar month
-- over the last p_months months (ending on the current month) with
-- avg(ln(bsr_rank)) and the observation count, which is exactly what the
-- extension's seasonality module folds into a 12-month demand index. The
-- extension applies the coverage floors client-side (>= 10 months with >= 3
-- points each), so the RPC returns every month it has and lets the caller
-- decide.
--
-- SECURITY DEFINER because the table is service-role only (RLS enabled, zero
-- policies); STABLE because it only reads. Called by the market route through
-- createAdminClient() (service_role); authenticated is granted as well to
-- match the other read RPCs (affiliate_clicks_stats).

CREATE OR REPLACE FUNCTION market_monthly_rank(
  p_asins       TEXT[],
  p_marketplace TEXT,
  p_months      INT DEFAULT 24
)
RETURNS TABLE (
  asin          TEXT,
  month         TEXT,
  log_mean_rank DOUBLE PRECISION,
  points        INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.asin,
    to_char(date_trunc('month', h.captured_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
    avg(ln(h.bsr_rank))::DOUBLE PRECISION                                     AS log_mean_rank,
    count(*)::INT                                                             AS points
  FROM product_market_history AS h
  WHERE h.asin = ANY (p_asins)
    AND h.marketplace = p_marketplace
    AND h.bsr_rank IS NOT NULL
    AND h.bsr_rank > 0
    AND h.captured_at >= (
      (date_trunc('month', now() AT TIME ZONE 'UTC')
        - make_interval(months => GREATEST(COALESCE(p_months, 24), 1) - 1))
      AT TIME ZONE 'UTC'
    )
    AND h.captured_at <= now()
  GROUP BY h.asin, 2
  ORDER BY h.asin, 2;
$$;

REVOKE ALL ON FUNCTION market_monthly_rank(TEXT[], TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market_monthly_rank(TEXT[], TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION market_monthly_rank(TEXT[], TEXT, INT) TO service_role;
