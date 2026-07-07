-- Deal Sites Harvester for the Chrome extension: Amazon products harvested from
-- third-party daily-deal aggregator sites (savewithcindy.shop, jungle.deals,
-- promos4creators.com, published Google Docs, etc.).
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/deals responds with
-- migrationPending: true and the extension keeps its queue locally.
--
-- Service-role only (RLS enabled, zero policies), same as the other extension_*
-- tables: every read/write goes through createAdminClient() in
-- /api/extension/deals after the caller is authenticated by license key
-- (extension) or session cookie (dashboard). updated_at is maintained by the
-- upsert code, not triggers.
--
-- One row per (user, asin, marketplace). A re-harvest of the same product
-- updates its row (price and discount move daily), so the unique key makes the
-- write an idempotent upsert.
CREATE TABLE IF NOT EXISTS extension_deals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin                 TEXT NOT NULL,
  marketplace          TEXT NOT NULL DEFAULT 'amazon.com',
  title                TEXT,
  price_cents          INTEGER,
  list_price_cents     INTEGER,
  discount_pct         INTEGER,
  commission_rate_pct  INTEGER,
  currency             TEXT NOT NULL DEFAULT 'USD',
  image_url            TEXT,
  source_url           TEXT NOT NULL,
  promo_code           TEXT,
  detected_at          TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asin, marketplace)
);

CREATE INDEX IF NOT EXISTS extension_deals_user_recent_idx
  ON extension_deals (user_id, detected_at DESC);

ALTER TABLE extension_deals ENABLE ROW LEVEL SECURITY;
