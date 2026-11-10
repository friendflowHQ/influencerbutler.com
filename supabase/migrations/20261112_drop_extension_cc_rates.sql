-- Drop the retired per-ASIN Creator Connections rate tables.
--
-- extension_cc_rates (~17M rows, ~2.9 GB) was rebuilt end to end by the
-- build-cc-rates cron, which exhausted the Supabase Disk IO budget. It was
-- retired on 2026-10-08: /api/extension/cc-rates reads the same data from the
-- asin-lookup Worker (src/lib/asin-lookup.ts), and nothing reads or writes
-- either table any more. The idle table still cost storage, backups and
-- autovacuum scans, so it goes.
--
-- No CASCADE on purpose: if anything unexpected still depends on these tables
-- (a view, a function), the DROP fails and nothing is removed.
--
-- Apply by hand in the Supabase SQL editor (project khutiiojhafblabtixpp).

DROP TABLE IF EXISTS extension_cc_rates;
DROP TABLE IF EXISTS extension_cc_rates_meta;
