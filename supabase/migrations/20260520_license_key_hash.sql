-- Add a precomputed SHA-256 hash of license_keys.key so the feedback
-- worker can resolve author_license_hash → user_id → profile in a
-- single indexed query. Requires pgcrypto for the backfill.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS key_hash TEXT;

UPDATE license_keys
   SET key_hash = encode(digest(key, 'sha256'), 'hex')
 WHERE key IS NOT NULL AND key_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS license_keys_key_hash_idx
  ON license_keys (key_hash) WHERE key_hash IS NOT NULL;
