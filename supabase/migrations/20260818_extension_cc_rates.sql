-- Per-ASIN Creator Connections commission rates for the Chrome extension's
-- search overlay ("Campaign 12%" chips + money-accurate commission estimates).
--
-- Built daily by /api/cron/build-cc-rates from the R2 CC catalogue
-- (dcb/catalogues/cc): campaign rows carry the commission rate, the asin-index
-- maps ASIN -> campaign ids, and the cron stores each ASIN's best active rate
-- here. Served to the extension by POST /api/extension/cc-rates (public, like
-- the catalogue Bloom filters: campaign availability is not user data).
--
-- extension_cc_rates_meta records the completed catalogue version. It is
-- written only after a full successful build, so a half-finished run (timeout)
-- leaves the old version in place and the next cron simply re-upserts
-- (idempotent by asin) until it completes.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the cc-rates cron/route. Both are
-- soft-fail: a missing table returns migrationPending / empty rates.

CREATE TABLE IF NOT EXISTS extension_cc_rates (
  asin      TEXT PRIMARY KEY,            -- uppercase, 10 chars
  rate_pct  NUMERIC(6, 2) NOT NULL,      -- best active campaign rate (16.00 = 16%)
  brand     TEXT,                        -- brand of that best campaign
  ends_at   TIMESTAMPTZ,                 -- campaign end date when parseable
  version   TEXT NOT NULL,               -- catalogue version this row came from
  built_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stale-version cleanup after a completed rebuild.
CREATE INDEX IF NOT EXISTS extension_cc_rates_version_idx ON extension_cc_rates (version);

CREATE TABLE IF NOT EXISTS extension_cc_rates_meta (
  kind       TEXT PRIMARY KEY,           -- always 'cc' for now
  version    TEXT NOT NULL,              -- last FULLY built catalogue version
  row_count  INTEGER NOT NULL DEFAULT 0,
  built_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-client access only (service role bypasses RLS; no user policies).
ALTER TABLE extension_cc_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_cc_rates_meta ENABLE ROW LEVEL SECURITY;
