-- Widen catalogue_harvest_status to track a third harvest kind: 'deals'
-- (Amazon Associates Deals Hub promo deals), alongside the existing 'cc' and
-- 'spcc'. The local hourly harvest runner now harvests deals too and reports a
-- heartbeat per kind via /api/admin/catalogue-harvest/heartbeat. campaign_count
-- carries the deal count for the 'deals' row.
--
-- NOTE: prod Supabase is applied by hand (migrations here lag prod). Run this
-- ALTER against prod before the first 'deals' heartbeat lands, or the upsert
-- will fail the kind CHECK and the heartbeat endpoint will 500.

ALTER TABLE catalogue_harvest_status
  DROP CONSTRAINT IF EXISTS catalogue_harvest_status_kind_check;

ALTER TABLE catalogue_harvest_status
  ADD CONSTRAINT catalogue_harvest_status_kind_check
  CHECK (kind IN ('cc', 'spcc', 'deals'));
