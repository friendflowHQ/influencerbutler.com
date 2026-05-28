-- Tracks the most recent CC + SPCC catalogue harvest run by the
-- InfluencerButler GitHub Actions cron. One row per kind (cc, spcc),
-- upserted on every successful harvest via /api/admin/catalogue-harvest/heartbeat.
--
-- Reads happen through /api/admin/catalogue-harvest/status (admin auth) and
-- power both the in-dashboard "Run harvest now" panel and the desktop's
-- soft staleness banner. No RLS for anon/authenticated: writes use the
-- service-role key from the heartbeat endpoint, reads use the same key
-- behind the admin auth gate.

CREATE TABLE IF NOT EXISTS catalogue_harvest_status (
  kind            TEXT PRIMARY KEY CHECK (kind IN ('cc', 'spcc')),
  status          TEXT NOT NULL,         -- 'ok' or 'error'
  message         TEXT,                  -- free-form error detail when status='error'
  version         TEXT,                  -- e.g. '20260528T1200Z' from the harvester
  snapshot_at     TIMESTAMPTZ,           -- ISO timestamp the run stamped on its NDJSON _meta
  campaign_count  INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalogue_harvest_status_reported_idx
  ON catalogue_harvest_status (reported_at DESC);

ALTER TABLE catalogue_harvest_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogue_harvest_status_no_anon" ON catalogue_harvest_status;
CREATE POLICY "catalogue_harvest_status_no_anon" ON catalogue_harvest_status
  FOR ALL USING (false) WITH CHECK (false);
