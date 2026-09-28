-- Tag-on-send for campaigns: optionally add everyone a campaign reaches to the
-- Contacts list (email_subscribers) and tag them, on top of any existing tags,
-- when the campaign materializes. Turns "send a campaign" into "send + grow and
-- segment the list" in one step. Applied by the /api/cron/email-marketing
-- materializer via tagRecipientsAsContacts() (src/lib/email-marketing.ts).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql. Both columns are
-- optional with safe defaults, so existing campaigns are unaffected. The code
-- tolerates these columns being absent (select *, insert falls back), so a
-- deploy before this paste degrades to "no tagging" rather than erroring.

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS apply_tag    TEXT,            -- tag to union onto every recipient (NULL = none)
  ADD COLUMN IF NOT EXISTS save_contacts BOOLEAN NOT NULL DEFAULT false; -- add pasted/segment recipients to Contacts
