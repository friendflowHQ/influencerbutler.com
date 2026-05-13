-- MCP API keys
-- Personal access tokens (PATs) issued from /dashboard/api-keys for the
-- Influencer Butler MCP server. Stored as sha256 hash; the plaintext is
-- shown to the user once at creation and never again.

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_user_idx
  ON mcp_api_keys (user_id, created_at DESC);

ALTER TABLE mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own keys (everything except key_hash, which clients
-- never need). The service role bypasses RLS for the actual MCP auth lookup.
DROP POLICY IF EXISTS "own_keys_select" ON mcp_api_keys;
CREATE POLICY "own_keys_select" ON mcp_api_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Inserts and revocations go through dedicated server routes that use the
-- service role and validate the user. RLS does not allow direct mutation.
