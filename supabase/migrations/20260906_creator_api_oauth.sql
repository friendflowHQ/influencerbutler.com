-- Migrate the Creator API credential vault from Product Advertising API
-- (PA-API SigV4) credentials to the real OAuth2 Creator API credentials the
-- desktop app uses.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/extension/creator-api and
-- /api/extension/enrich respond with migrationPending: true.
--
-- The table (20260708_creator_api_creds.sql) stores credentials in the
-- `marketplaces` JSONB array; only the per-entry shape changes, so there is no
-- column change. Each entry now holds
--   { host, partnerTag, credentialId, credentialVersion, secretCipher, iv, authTag }
-- where secretCipher is the AES-256-GCM ciphertext of the OAuth Credential
-- Secret (encrypted with CREATOR_API_ENC_KEY), instead of the old
--   { host, partnerTag, accessKeyId, secretCipher, iv, authTag }
-- PA-API shape. The old and new shapes are not interchangeable (a PA-API access
-- key is not an OAuth Credential ID), so any pre-existing PA-API entries are
-- cleared: the extension re-saves the user's OAuth credentials on next launch.
--
-- Detection: an old entry has an `accessKeyId` key and no `credentialId` key.
-- Rows whose marketplaces array contains any such entry are reset to '[]'.

UPDATE extension_creator_api_creds
SET marketplaces = '[]'::jsonb,
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(marketplaces) AS entry
  WHERE entry ? 'accessKeyId'
    AND NOT (entry ? 'credentialId')
);

-- Backup-credential leasing: when Amazon has not unlocked the Creator API for a
-- user's own account, they can lease Influencer Butler's house credentials (via
-- the licensing Worker) on a short expiring lease. The leased set is stored here
-- as { enabled, credentialId, credentialVersion, partnerTag, marketplace,
-- secretCipher, iv, authTag, expiresAt }, the secret encrypted the same way as
-- the user's own. Null when the user has never enabled backup.
ALTER TABLE extension_creator_api_creds
  ADD COLUMN IF NOT EXISTS backup JSONB;
