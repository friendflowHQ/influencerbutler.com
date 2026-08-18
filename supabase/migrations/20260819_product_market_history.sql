-- Shared product market catalogue (Influencer Butler "internal Keepa").
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the /api/extension/market* routes respond
-- with migrationPending: true and the extension keeps browsing normally
-- (it just cannot contribute to or read the shared pool yet).
--
-- Both tables are service-role only (RLS enabled, zero policies), same as
-- extension_product_scans: every read/write goes through createAdminClient()
-- in the /api/extension/* routes after the caller is authenticated by license
-- key (extension) or session cookie (dashboard).
--
-- Unlike extension_product_scans (one upsert row per user+asin), this is a
-- SHARED, de-identified pool: creators who opt in contribute product facts
-- (never personal data), and every signed-in user can read the pooled result.
-- contributor_user_id is retained for opt-in audit and abuse control only and
-- is NEVER returned on read.

-- Append-only trend log: one row per contributed observation of a product, so
-- price and best-seller rank accumulate a real history over time (this is the
-- piece Amazon took away). Do NOT convert this to an upsert - the whole point
-- is that rows accumulate.
CREATE TABLE IF NOT EXISTS product_market_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin                TEXT NOT NULL,
  marketplace         TEXT NOT NULL DEFAULT 'amazon.com',
  captured_at         TIMESTAMPTZ NOT NULL,
  price_cents         INTEGER,
  currency            TEXT NOT NULL DEFAULT 'USD',
  bsr_rank            INTEGER,
  bsr_category        TEXT,
  bought_past_month   INTEGER,
  category_label      TEXT,
  brand               TEXT,
  source              TEXT NOT NULL DEFAULT 'browse',
  contributor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read path: latest points for a product, newest first.
CREATE INDEX IF NOT EXISTS product_market_history_asin_recent_idx
  ON product_market_history (asin, marketplace, captured_at DESC);

-- Calibration path: regress bought_past_month against bsr_rank within a BSR
-- category. Partial index keeps it to rows that carry both signals.
CREATE INDEX IF NOT EXISTS product_market_history_calibration_idx
  ON product_market_history (bsr_category, bsr_rank)
  WHERE bsr_rank IS NOT NULL AND bought_past_month IS NOT NULL;

ALTER TABLE product_market_history ENABLE ROW LEVEL SECURITY;

-- Fast current-snapshot per product: upserted on every contribution so reads
-- of "now" values (price, rank, bought/month) do not scan the history log.
CREATE TABLE IF NOT EXISTS product_market_latest (
  asin              TEXT NOT NULL,
  marketplace       TEXT NOT NULL DEFAULT 'amazon.com',
  price_cents       INTEGER,
  currency          TEXT NOT NULL DEFAULT 'USD',
  bsr_rank          INTEGER,
  bsr_category      TEXT,
  bought_past_month INTEGER,
  category_label    TEXT,
  brand             TEXT,
  captured_at       TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asin, marketplace)
);

ALTER TABLE product_market_latest ENABLE ROW LEVEL SECURITY;

-- Per-category BSR -> monthly-sales curves fit from our own co-captured data
-- (sales ~= a * rank^(-b)). One row per BSR category label. Seeded with
-- rule-of-thumb coefficients, then refit by the calibration cron. Kept as a
-- table (not R2) so the estimator can read it with one indexed lookup.
CREATE TABLE IF NOT EXISTS product_sales_curves (
  bsr_category  TEXT PRIMARY KEY,
  coef_a        DOUBLE PRECISION NOT NULL,
  coef_b        DOUBLE PRECISION NOT NULL,
  sample_size   INTEGER NOT NULL DEFAULT 0,
  r_squared     DOUBLE PRECISION,
  fit_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE product_sales_curves ENABLE ROW LEVEL SECURITY;
