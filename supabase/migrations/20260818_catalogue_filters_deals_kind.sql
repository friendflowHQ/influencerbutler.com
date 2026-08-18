-- Widen extension_catalogue_filters to allow a third bloom kind: 'deals'
-- (Amazon Associates Deals Hub promo deals), alongside the existing 'cc' and
-- 'spcc'. The build-catalogue-filters cron (KINDS = ['cc','spcc','deals']) and
-- the serve route /api/extension/catalogue/[kind] both already handle 'deals';
-- only the table's kind CHECK still rejects it.
--
-- Without this, the nightly deals bloom upsert fails the kind CHECK and is
-- swallowed by the per-kind try/catch in the cron (results.deals = "error: ..."),
-- so deal blooms never build and the extension shows no deal badges.
--
-- NOTE: prod Supabase is applied by hand (migrations here lag prod). Run this
-- ALTER against prod. Precedent: 20260616_catalogue_harvest_status_deals.sql
-- does the identical widening for the sibling catalogue_harvest_status table.

ALTER TABLE extension_catalogue_filters
  DROP CONSTRAINT IF EXISTS extension_catalogue_filters_kind_check;

ALTER TABLE extension_catalogue_filters
  ADD CONSTRAINT extension_catalogue_filters_kind_check
  CHECK (kind IN ('cc', 'spcc', 'deals'));
