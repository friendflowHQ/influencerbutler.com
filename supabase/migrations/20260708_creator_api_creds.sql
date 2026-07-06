-- Creator API (Amazon Product Advertising API) credential vault for the
-- Chrome extension enrichment feature.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/creator-api and
-- /api/extension/enrich respond with migrationPending: true and the extension
-- shows the "set up Creator API" call to action instead of enrichment.
--
-- Service-role only (RLS enabled, zero policies), same as the other
-- extension_* tables (20260706_extension_data.sql): every read/write goes
-- through createAdminClient() after the caller is authenticated by license
-- key. The PA-API secret key is NEVER stored in plaintext: each marketplace
-- entry in `marketplaces` holds { host, partnerTag, accessKeyId, secretCipher,
-- iv, authTag } where secretCipher is AES-256-GCM ciphertext encrypted with
-- CREATOR_API_ENC_KEY (a Vercel env secret, never in git or the DB), so a
-- database-only breach yields ciphertext, not usable secrets.

CREATE TABLE IF NOT EXISTS extension_creator_api_creds (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE extension_creator_api_creds ENABLE ROW LEVEL SECURITY;
