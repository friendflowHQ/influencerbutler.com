-- Orders Butler for the Chrome extension: harvested Amazon order history.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/orders responds with
-- migrationPending: true and the extension keeps its queue locally.
--
-- Service-role only (RLS enabled, zero policies), same as the other
-- extension_* tables: every read/write goes through createAdminClient() in
-- /api/extension/orders after the caller is authenticated by license key
-- (extension) or session cookie (dashboard). updated_at is maintained by the
-- upsert code, not triggers.
--
-- One row per (order, asin) line item. An order can contain several ASINs, so
-- the extension emits one finding per line item; the unique key makes a repeat
-- sync of the same purchase idempotent.
CREATE TABLE IF NOT EXISTS extension_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id     TEXT NOT NULL,
  asin         TEXT NOT NULL,
  marketplace  TEXT NOT NULL DEFAULT 'amazon.com',
  title        TEXT,
  price_cents  INTEGER,
  currency     TEXT NOT NULL DEFAULT 'USD',
  order_date   DATE,
  detected_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id, asin)
);

CREATE INDEX IF NOT EXISTS extension_orders_user_recent_idx
  ON extension_orders (user_id, order_date DESC);

ALTER TABLE extension_orders ENABLE ROW LEVEL SECURITY;
