-- Weekly company valuation snapshots for the admin Finance dashboard's
-- Valuation tab.
--
-- NOTE: prod Supabase is migrated by hand and lags this folder. Until this
-- file is applied in prod, /api/admin/finance/valuation and
-- /api/cron/valuation return { migrationPending: true } instead of erroring
-- (see isMigrationPendingError() in src/lib/finance-stepup.ts).
--
-- One row per week, keyed by the Monday it represents, so a re-run (manual
-- recompute, or the Monday routine firing twice) upserts in place instead of
-- piling up duplicates.
CREATE TABLE IF NOT EXISTS valuation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  active_subscriptions INTEGER NOT NULL,
  mrr_cents BIGINT NOT NULL,
  arr_cents BIGINT NOT NULL,
  monthly_growth_rate NUMERIC,
  multiple_low NUMERIC NOT NULL,
  multiple_base NUMERIC NOT NULL,
  multiple_high NUMERIC NOT NULL,
  valuation_low_cents BIGINT NOT NULL,
  valuation_base_cents BIGINT NOT NULL,
  valuation_high_cents BIGINT NOT NULL,
  inputs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS valuation_snapshots_date_idx ON valuation_snapshots (snapshot_date DESC);

-- Service-role only, zero policies - same convention as finance_* and
-- growth_* tables: all access goes through createAdminClient() inside
-- permission-gated /api/admin/* and /api/cron/* routes, never an anon client.
ALTER TABLE valuation_snapshots ENABLE ROW LEVEL SECURITY;
