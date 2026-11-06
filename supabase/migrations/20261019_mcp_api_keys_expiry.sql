-- MCP API keys never expired: a token was valid forever until manually
-- revoked, and last_used_at was collected but never written anywhere, so a
-- quietly-reused leaked token was both permanent and invisible.
--
-- Add expires_at (nullable; application code sets a 1-year default on
-- create) and backfill existing, still-valid keys with a 1-year expiry from
-- their creation date so this closes the gap for keys already issued, not
-- just new ones.

ALTER TABLE mcp_api_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE mcp_api_keys
  SET expires_at = created_at + INTERVAL '1 year'
  WHERE expires_at IS NULL AND revoked_at IS NULL;
