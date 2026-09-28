-- Client action events: the raw feed behind the public "proof of numbers"
-- counters on the marketing site.
--
-- The browser extension and the desktop app perform automated actions on a
-- creator's behalf (harvesting deals, scanning products, accepting Creator
-- Connections campaigns, and later messaging creators / optimizing lists). Some
-- of those already land in their own tables (extension_deals,
-- extension_product_scans), but actions that never otherwise touch our backend
-- (a campaign accept happens entirely in the browser against Amazon's own
-- Accept button) have nowhere to be counted. This table is that home: one row
-- per reported batch, carrying a metric name and how many actions it covered.
--
-- Deliberately metric-generic (a TEXT `metric` column, not one table per
-- action) so the desktop app can later POST metric='creator_messaged' or
-- 'benable_list_optimized' with the same Bearer-license pattern and no schema
-- change. We store one row per batch with a `count`, not one row per action, so
-- a busy harvest does not balloon the table: the public counter reads
-- SUM(count) per metric.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the accepts ingest route soft-fails with
-- { migrationPending: true } and the proof-numbers counter for this metric
-- reads its baseline only.
--
-- Service-role only (RLS enabled, zero policies), same as activity_events and
-- the extension_* tables: every read/write goes through createAdminClient()
-- after the route has authenticated the caller by license key.

CREATE TABLE IF NOT EXISTS client_action_events (
  id         BIGSERIAL PRIMARY KEY,
  metric     TEXT NOT NULL,              -- e.g. 'campaign_accepted'
  source     TEXT,                       -- e.g. 'auto' | 'manual' | 'extension' | 'desktop'
  user_id    UUID,                       -- the reporting account, when known
  count      INTEGER NOT NULL DEFAULT 1, -- how many actions this row covers
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The public counter aggregates SUM(count) per metric, newest windows first.
CREATE INDEX IF NOT EXISTS client_action_events_metric_created_idx
  ON client_action_events (metric, created_at DESC);

ALTER TABLE client_action_events ENABLE ROW LEVEL SECURITY;

-- Pre-aggregated totals per metric, so the public counter reads one small row
-- instead of pulling every event row and summing in application code (PostgREST
-- caps a plain select at ~1000 rows, which would silently undercount a running
-- all-time total). Read through the service-role client, which bypasses RLS.
CREATE OR REPLACE VIEW client_action_totals AS
  SELECT metric,
         SUM(count)::bigint AS total,
         MAX(created_at)    AS last_at
  FROM client_action_events
  GROUP BY metric;
