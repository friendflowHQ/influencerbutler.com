-- Shared product VIDEO catalogue (Influencer Butler video intelligence).
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the /api/extension/video-intel routes
-- respond with migrationPending: true and the extension keeps browsing
-- normally (it just cannot contribute to or read the shared video pool yet).
--
-- Both tables are service-role only (RLS enabled, zero policies), same as
-- product_market_history: every read/write goes through createAdminClient()
-- in the /api/extension/* routes after the caller is authenticated by license
-- key (extension) or session cookie (dashboard).
--
-- This is a SHARED, de-identified pool of PLACEMENT facts: which creator video
-- holds which product carousel, at what position, observed on a given day.
-- Contribution rides the same opt-in as the market catalogue
-- (settings.contributeCatalogue, OFF by default) and carries no personal data.
-- contributor_user_id is retained for opt-in audit and abuse control only and
-- is NEVER returned on read.
--
-- Cardinality is users x ASINs x videos x days, so the pool is deduped to ONE
-- row per (video_id, asin, marketplace, observed_day): every contributor who
-- loaded that product on that day collapses into a single row. History still
-- accumulates because there is one row PER DAY (append across days, upsert
-- within a day). That is what bounds volume without losing the time series.

CREATE TABLE IF NOT EXISTS product_video_observations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin                TEXT NOT NULL,
  marketplace         TEXT NOT NULL DEFAULT 'amazon.com',
  video_id            TEXT NOT NULL,
  creator_id          TEXT,
  creator_name        TEXT,
  creator_type        TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (creator_type IN ('influencer', 'brand', 'customer', 'unknown')),
  carousel            TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (carousel IN ('upper', 'lower', 'unknown')),
  position            INTEGER,
  title               TEXT,
  video_url           TEXT,
  observed_day        DATE NOT NULL,
  observed_at         TIMESTAMPTZ NOT NULL,
  contributor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, asin, marketplace, observed_day)
);

-- Per-video passport reads (presence, rotation, daily series over 90 days).
CREATE INDEX IF NOT EXISTS product_video_obs_video_day_idx
  ON product_video_observations (video_id, marketplace, observed_day DESC);

-- Per-ASIN carousel reads (who is in this product's carousel over time).
CREATE INDEX IF NOT EXISTS product_video_obs_asin_day_idx
  ON product_video_observations (asin, marketplace, observed_day DESC);

-- Rotation math walks (video_id, asin) ordered by day.
CREATE INDEX IF NOT EXISTS product_video_obs_video_asin_day_idx
  ON product_video_observations (video_id, asin, marketplace, observed_day);

ALTER TABLE product_video_observations ENABLE ROW LEVEL SECURITY;

-- Fast current snapshot per placement: powers "current carousel snapshot"
-- (Upper #4 / Lower #10) and "Last observed ..." without scanning the log.
CREATE TABLE IF NOT EXISTS product_video_latest (
  video_id         TEXT NOT NULL,
  asin             TEXT NOT NULL,
  marketplace      TEXT NOT NULL DEFAULT 'amazon.com',
  creator_id       TEXT,
  creator_name     TEXT,
  creator_type     TEXT NOT NULL DEFAULT 'unknown',
  carousel         TEXT NOT NULL DEFAULT 'unknown',
  position         INTEGER,
  title            TEXT,
  video_url        TEXT,
  last_observed_at TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, asin, marketplace)
);

CREATE INDEX IF NOT EXISTS product_video_latest_asin_idx
  ON product_video_latest (asin, marketplace);

ALTER TABLE product_video_latest ENABLE ROW LEVEL SECURITY;
