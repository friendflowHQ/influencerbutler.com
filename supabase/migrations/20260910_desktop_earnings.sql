-- Earnings on the web: read-only creator earnings dashboard fed by the
-- desktop app's Earnings Intelligence workspace ("Sync to web").
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/desktop/earnings-sync responds with
-- migrationPending: true and the desktop app keeps its data locally; the
-- /dashboard/earnings page shows its empty state.
--
-- Service-role only (RLS enabled, zero policies), same as the extension_*
-- tables: every read/write goes through createAdminClient() after the caller
-- is authenticated by license key (desktop app, POST /api/desktop/earnings-sync)
-- or session cookie (dashboard, GET /api/dashboard/earnings). Available on the
-- Free tier on purpose: the web view has no entitlement gate.
--
-- Money is stored as integer cents (bigint) in the currency recorded on the
-- sync meta row. The desktop app is the source of truth: a sync REPLACES the
-- month rows inside the posted min..max month range (older months are left
-- alone) and replaces the top-ASIN rows for every posted period.

-- One row per (user, calendar month). `month` is always the first of the month.
CREATE TABLE IF NOT EXISTS desktop_earnings_months (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month               DATE NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  onsite_cents        BIGINT NOT NULL DEFAULT 0,
  cc_cents            BIGINT NOT NULL DEFAULT 0,
  offsite_cents       BIGINT NOT NULL DEFAULT 0,
  brand_deal_cents    BIGINT NOT NULL DEFAULT 0,
  international_cents BIGINT NOT NULL DEFAULT 0,
  bonus_cents         BIGINT NOT NULL DEFAULT 0,
  total_cents         BIGINT NOT NULL DEFAULT 0,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS desktop_earnings_months_user_month_idx
  ON desktop_earnings_months (user_id, month DESC);

ALTER TABLE desktop_earnings_months ENABLE ROW LEVEL SECURITY;

-- Top earning ASINs per period. `period` is 'all', '12m', or 'YYYY-MM'.
CREATE TABLE IF NOT EXISTS desktop_earnings_top_asins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,
  asin         TEXT NOT NULL,
  marketplace  TEXT NOT NULL DEFAULT 'amazon.com',
  title        TEXT,
  image_url    TEXT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  units        INTEGER NOT NULL DEFAULT 0,
  orders       INTEGER NOT NULL DEFAULT 0,
  rank         INTEGER NOT NULL DEFAULT 1,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period, asin)
);

CREATE INDEX IF NOT EXISTS desktop_earnings_top_asins_user_period_rank_idx
  ON desktop_earnings_top_asins (user_id, period, rank);

ALTER TABLE desktop_earnings_top_asins ENABLE ROW LEVEL SECURITY;

-- One row per user: when the desktop app last synced and what it sent.
CREATE TABLE IF NOT EXISTS desktop_earnings_sync_meta (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version     TEXT,
  currency        TEXT NOT NULL DEFAULT 'USD',
  offsite_tracked BOOLEAN NOT NULL DEFAULT false,
  months_count    INTEGER NOT NULL DEFAULT 0,
  asins_count     INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE desktop_earnings_sync_meta ENABLE ROW LEVEL SECURITY;
