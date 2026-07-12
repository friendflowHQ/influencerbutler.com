-- Instagram Goldmine for the Chrome extension (self-hosted build): harvested
-- creator handles + bio emails, one row per (username, email).
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/instagram-creators responds
-- with migrationPending: true and the extension keeps its queue locally.
--
-- Service-role only (RLS enabled, zero policies), same as the other extension_*
-- tables: every read/write goes through createAdminClient() in the route after
-- the caller is authenticated by license key (extension) or session cookie
-- (dashboard). updated_at is maintained by the upsert code, not triggers.
--
-- A creator can surface more than one address and the same address recurs
-- across hashtags, so the finding is keyed on (username, email); the unique key
-- makes a repeat harvest of the same pair idempotent (newest data wins).
CREATE TABLE IF NOT EXISTS extension_instagram_creators (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username             TEXT NOT NULL,
  email                TEXT NOT NULL,
  source_hashtag       TEXT,
  full_name            TEXT,
  follower_count       INTEGER,
  engagement_rate_pct  NUMERIC(6, 2),
  bio_link_url         TEXT,
  post_url             TEXT,
  detected_at          TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, username, email)
);

CREATE INDEX IF NOT EXISTS extension_instagram_creators_user_recent_idx
  ON extension_instagram_creators (user_id, detected_at DESC);

ALTER TABLE extension_instagram_creators ENABLE ROW LEVEL SECURITY;
