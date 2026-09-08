-- Add the source campaign id to the extension's per-ASIN Creator Connections
-- rate table, so the extension can open the exact campaign a product's rate
-- came from (the standalone "Accept CC campaign" flow drives Amazon's own
-- Accept button on that campaign's page; a product page only knows the ASIN).
--
-- Additive and idempotent: existing rows keep campaign_id NULL until the next
-- /api/cron/build-cc-rates run rewrites them (the build is a full upsert by
-- asin). Both the cron and POST /api/extension/cc-rates tolerate the column
-- being absent (they fall back to the pre-migration shape), so deploy order
-- does not matter.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor; until then cc-rates responses carry no campaignId
-- and the extension routes standalone accepts through the grid fallback only
-- when it already knows an id.

ALTER TABLE extension_cc_rates ADD COLUMN IF NOT EXISTS campaign_id TEXT;
