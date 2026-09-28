-- Allow the 'deals' catalogue kind in extension_catalogue_filters.
--
-- 20260709 created the table with CHECK (kind IN ('cc','spcc')) and was never
-- widened when the deals catalogue was added, so the first real
-- build-catalogue-filters run (2026-08-17, after the public-R2 fix) built cc
-- and spcc but failed the deals upsert on this constraint. The extension's
-- "Deal" search chips read the deals Bloom, so they stay dark until this is
-- applied.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this
-- into the Supabase SQL editor, then re-run /api/cron/build-cc-rates's
-- sibling /api/cron/build-catalogue-filters (or wait for the daily 04:00 UTC
-- run) to build the deals filter.

ALTER TABLE extension_catalogue_filters
  DROP CONSTRAINT IF EXISTS extension_catalogue_filters_kind_check;

ALTER TABLE extension_catalogue_filters
  ADD CONSTRAINT extension_catalogue_filters_kind_check
  CHECK (kind IN ('cc', 'spcc', 'deals'));
