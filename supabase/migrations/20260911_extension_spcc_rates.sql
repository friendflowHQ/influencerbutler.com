-- Per-ASIN "Sponsored Products for Creators" (SPCC / "Earn on Clicks") data for
-- the Chrome extension's search overlay ("Campaign - Up to $0.50/click" chips).
--
-- Built daily by /api/cron/build-spcc-rates from the R2 SPCC catalogue
-- (dcb/catalogues/spcc): unlike the CC catalogue, each SPCC catalog row is
-- already ASIN-keyed and carries Amazon's own estimatedEpc + budgetAvailability
-- fields directly, so the build is a single streamed pass (no asin-index join).
-- Served to the extension by POST /api/extension/spcc-rates (public, like the
-- CC rates endpoint: campaign availability is not user data).
--
-- estimated_epc is Amazon's own forecast ("Up to $X per click"), NOT the
-- creator's realized per-click earnings (see extension epc field on
-- CampaignStatusRecord for that, sourced from the desktop ledger) - keep these
-- two meanings separate everywhere this column is read.
--
-- extension_spcc_rates_meta records the completed catalogue version, written
-- only after a full successful build, mirroring extension_cc_rates_meta.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the spcc-rates cron/route. Both are
-- soft-fail: a missing table returns migrationPending / empty rates.

CREATE TABLE IF NOT EXISTS extension_spcc_rates (
  asin                 TEXT PRIMARY KEY,       -- uppercase, 10 chars
  estimated_epc        NUMERIC(10, 4) NOT NULL, -- Amazon's forecast $/click (0.5030 = $0.503)
  budget_availability   TEXT,                    -- "low" | "medium" | "high", as Amazon reports it
  brand                TEXT,
  version              TEXT NOT NULL,           -- catalogue version this row came from
  built_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stale-version cleanup after a completed rebuild.
CREATE INDEX IF NOT EXISTS extension_spcc_rates_version_idx ON extension_spcc_rates (version);

CREATE TABLE IF NOT EXISTS extension_spcc_rates_meta (
  kind       TEXT PRIMARY KEY,           -- always 'spcc' for now
  version    TEXT NOT NULL,              -- last FULLY built catalogue version
  row_count  INTEGER NOT NULL DEFAULT 0,
  built_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-client access only (service role bypasses RLS; no user policies).
ALTER TABLE extension_spcc_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_spcc_rates_meta ENABLE ROW LEVEL SECURITY;
