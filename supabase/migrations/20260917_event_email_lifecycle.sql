-- Events: per-event email lifecycle (auto-invite ahead of time + replay
-- follow-up afterward). The 24h/1h reminders to registrants already exist
-- (cron/event-reminders); this adds the two ends of the funnel:
--
--   invite_*  : an announcement campaign scheduled to go out N days before the
--               event to a chosen audience, driving registrations. Stored as a
--               normal email_campaigns row (the marketing cron sends it); we
--               keep the link + the chosen audience here so the admin can see
--               and re-plan it.
--   replay_*  : a follow-up email to registrants with the replay video link,
--               sent once, replay_hours_after hours after the event ends (and
--               only once a YouTube/recording link exists). replay_emailed_at
--               makes it idempotent, mirroring reminded_24h_at/reminded_1h_at.
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Safe to re-run (IF NOT EXISTS). The code reads
-- these columns with a try-full-then-base fallback, so a deploy that lands
-- before this migration degrades gracefully (lifecycle fields read as null)
-- rather than breaking event reads.

-- replay_hours_after is nullable on purpose: NULL means "no replay follow-up
-- for this event" so the admin can turn it off per event, while the DEFAULT 3
-- means new events get a replay email 3 hours after they end (only once a
-- replay link exists, and the cron only looks at recently-ended events, so this
-- never backfills historical events).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS invite_audience     JSONB,
  ADD COLUMN IF NOT EXISTS invite_days_before  INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS invite_campaign_id  UUID,
  ADD COLUMN IF NOT EXISTS replay_subject      TEXT,
  ADD COLUMN IF NOT EXISTS replay_body         TEXT,
  ADD COLUMN IF NOT EXISTS replay_hours_after  INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS replay_emailed_at   TIMESTAMPTZ;
