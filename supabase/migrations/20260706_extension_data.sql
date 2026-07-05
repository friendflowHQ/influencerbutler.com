-- Chrome extension sync tables (Influencer Butler Extension).
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/* routes respond with
-- migrationPending: true and the extension keeps its queue locally.
--
-- All three tables are service-role only (RLS enabled, zero policies), same
-- as growth_goals / email_subscribers: every read/write goes through
-- createAdminClient() in /api/extension/* routes after the caller is
-- authenticated by license key (extension) or session cookie (dashboard).
-- updated_at is maintained by the upsert code, not triggers.

-- One row per product a signed-in user has scanned: the video-carousel
-- breakdown plus the Butler Approved verdict at last scan.
CREATE TABLE IF NOT EXISTS extension_product_scans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin                   TEXT NOT NULL,
  marketplace            TEXT NOT NULL DEFAULT 'amazon.com',
  title                  TEXT,
  price_cents            INTEGER,
  currency               TEXT NOT NULL DEFAULT 'USD',
  brand_video_count      INTEGER NOT NULL DEFAULT 0,
  influencer_video_count INTEGER NOT NULL DEFAULT 0,
  customer_video_count   INTEGER NOT NULL DEFAULT 0,
  approved               BOOLEAN NOT NULL DEFAULT false,
  approved_criteria      JSONB,
  scanned_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asin, marketplace)
);

CREATE INDEX IF NOT EXISTS extension_product_scans_user_recent_idx
  ON extension_product_scans (user_id, scanned_at DESC);

ALTER TABLE extension_product_scans ENABLE ROW LEVEL SECURITY;

-- Products the user already bought that have few or zero influencer videos:
-- the "film what you own" list from the order-history scan.
CREATE TABLE IF NOT EXISTS extension_content_gaps (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin                   TEXT NOT NULL,
  marketplace            TEXT NOT NULL DEFAULT 'amazon.com',
  title                  TEXT,
  gap_type               TEXT NOT NULL
                         CHECK (gap_type IN ('no_influencer_video','low_influencer_video')),
  influencer_video_count INTEGER NOT NULL DEFAULT 0,
  order_date             DATE,
  detected_at            TIMESTAMPTZ NOT NULL,
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asin, marketplace)
);

CREATE INDEX IF NOT EXISTS extension_content_gaps_user_open_idx
  ON extension_content_gaps (user_id, detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE extension_content_gaps ENABLE ROW LEVEL SECURITY;

-- Latest storefront checkup snapshot. Each scan replaces the previous rows
-- for that storefront_url (a checkup is a snapshot, not a log).
CREATE TABLE IF NOT EXISTS extension_storefront_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storefront_url TEXT,
  issue_type     TEXT NOT NULL
                 CHECK (issue_type IN ('untagged','over_tagged','unavailable_product')),
  severity       TEXT NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error')),
  subject        TEXT,
  detail         TEXT,
  detected_at    TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extension_storefront_issues_user_idx
  ON extension_storefront_issues (user_id, detected_at DESC);

ALTER TABLE extension_storefront_issues ENABLE ROW LEVEL SECURITY;
