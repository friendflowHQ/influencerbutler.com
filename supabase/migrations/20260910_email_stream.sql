-- Sending-stream classification for sequences and campaigns.
--
-- Three streams keep cold-outreach reputation off the transactional and
-- lifecycle paths (see src/lib/email-senders.ts):
--   - lifecycle: marketing to KNOWN users, sends on the brand domain.
--   - cold: cold sequences/campaigns to non-customers, sends from a SEPARATE
--     cold domain (EMAIL_FROM_COLD). While that sender is unset, the cron holds
--     every cold drip (paused) instead of sending it from the brand domain.
--
-- Defaults to 'lifecycle' so applying this migration disrupts nothing: existing
-- sequences/campaigns keep sending on the brand domain exactly as before. Mark
-- the known cold drips (cold Amazon-influencer, IG Posse, Dani Austin, Live
-- Sweet, etc.) as 'cold' from the admin UI to pause them until a cold domain is
-- ready.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql. Additive and safe
-- to re-run. The cron degrades gracefully (treats the column as 'lifecycle')
-- until this is applied.

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS stream TEXT NOT NULL DEFAULT 'lifecycle'
  CHECK (stream IN ('lifecycle', 'cold'));

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS stream TEXT NOT NULL DEFAULT 'lifecycle'
  CHECK (stream IN ('lifecycle', 'cold'));
