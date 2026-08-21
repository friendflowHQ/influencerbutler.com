-- Walmart support for the shared product catalogue ("internal Keepa").
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the Walmart path of /api/extension/market
-- responds with migrationPending: true (missing-column soft-fail) and the
-- extension keeps browsing Walmart normally; it just cannot contribute to or
-- read the pooled Walmart data yet. The Amazon path is unaffected.
--
-- This migration is PURELY ADDITIVE: it adds a retailer dimension and Walmart's
-- demand signals to the existing tables. It does NOT touch the primary key.
-- Walmart rows reuse the existing (asin, marketplace) key by writing the Walmart
-- item id into `asin`; marketplace 'walmart.com' namespaces those ids away from
-- real ASINs, so the existing upsert conflict target works for both retailers
-- with no primary-key surgery (safe on the lagging prod schema).

-- Append-only trend log: gains the generic retailer/item_id dimension plus
-- Walmart's review count and native rank (Amazon rows leave these null).
ALTER TABLE product_market_history
  ADD COLUMN IF NOT EXISTS retailer      TEXT NOT NULL DEFAULT 'amazon',
  ADD COLUMN IF NOT EXISTS item_id       TEXT,
  ADD COLUMN IF NOT EXISTS num_reviews   INTEGER,
  ADD COLUMN IF NOT EXISTS retailer_rank INTEGER;

-- Backfill item_id for existing Amazon rows so it is always populated going
-- forward (nullable-then-backfill avoids failing the ALTER on a populated
-- table, per the repo's NOT-NULL upsert gotchas).
UPDATE product_market_history SET item_id = asin WHERE item_id IS NULL;

-- Read path for Walmart: latest points for an item, newest first.
CREATE INDEX IF NOT EXISTS product_market_history_retailer_item_recent_idx
  ON product_market_history (retailer, item_id, marketplace, captured_at DESC);

-- Current-snapshot table: same additive columns.
ALTER TABLE product_market_latest
  ADD COLUMN IF NOT EXISTS retailer      TEXT NOT NULL DEFAULT 'amazon',
  ADD COLUMN IF NOT EXISTS item_id       TEXT,
  ADD COLUMN IF NOT EXISTS num_reviews   INTEGER,
  ADD COLUMN IF NOT EXISTS retailer_rank INTEGER;

UPDATE product_market_latest SET item_id = asin WHERE item_id IS NULL;

-- Read path for Walmart snapshots by (retailer, item_id, marketplace). Not a
-- unique constraint: uniqueness is still enforced by the existing
-- (asin, marketplace) primary key, which Walmart rows satisfy via asin=item_id.
CREATE INDEX IF NOT EXISTS product_market_latest_retailer_item_idx
  ON product_market_latest (retailer, item_id, marketplace);
