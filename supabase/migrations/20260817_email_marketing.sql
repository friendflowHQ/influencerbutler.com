-- Email marketing engine: tags on contacts, one-off campaigns, and custom
-- drip sequences, all sent through the tracked sendMarketingEmail() pipeline
-- (suppression, unsubscribe footer, email_sends logging come from there).
--
-- Contacts are the existing email_subscribers table, extended with a tags
-- array. Campaigns and sequences are queued here and drained by the
-- /api/cron/email-marketing cron in per-run batches.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260816_email_sends.sql. Everything is
-- IF NOT EXISTS and safe to re-run. Until applied, the marketing tabs show a
-- migration-pending banner and the cron no-ops; nothing 500s.

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS email_subscribers_tags_idx
  ON email_subscribers USING GIN (tags);

-- One-off blasts. body is plain text (the composer is text-only by design);
-- audience is the JSONB Audience shape validated by src/lib/email-audience.ts.
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  audience        JSONB NOT NULL DEFAULT '{"kind":"all_contacts"}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | sending | sent | cancelled
  scheduled_at    TIMESTAMPTZ,                    -- draft with scheduled_at <= now(): cron flips to sending
  materialized_at TIMESTAMPTZ,                    -- recipients resolved and inserted
  created_by      TEXT NOT NULL DEFAULT '',       -- actor email
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_campaigns_status_idx
  ON email_campaigns (status, created_at DESC);
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,                  -- always lowercased + trimmed
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | sent | skipped | failed
  attempts    INT NOT NULL DEFAULT 0,
  sent_at     TIMESTAMPTZ,
  UNIQUE (campaign_id, email)
);
CREATE INDEX IF NOT EXISTS email_campaign_recipients_queue_idx
  ON email_campaign_recipients (campaign_id, status);
ALTER TABLE email_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Custom drip funnels. Created paused so nothing sends until deliberately
-- activated. trigger enables auto-enrollment:
--   {"kind":"tag_added","tag":"..."}  fired synchronously by the contacts API
--   {"kind":"source","source":"..."}  polled by the cron over a 7-day window
CREATE TABLE IF NOT EXISTS email_sequences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'paused',  -- active | paused
  trigger    JSONB,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  position    INT NOT NULL,            -- 1-based
  day_offset  INT NOT NULL DEFAULT 0,  -- days after enrolled_at (not after the previous step)
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  UNIQUE (sequence_id, position)
);
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,       -- always lowercased + trimmed
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_step_sent    INT NOT NULL DEFAULT 0,  -- 0 = none sent yet
  last_step_sent_at TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  UNIQUE (sequence_id, email)
);
CREATE INDEX IF NOT EXISTS email_sequence_enrollments_open_idx
  ON email_sequence_enrollments (sequence_id, enrolled_at)
  WHERE completed_at IS NULL AND cancelled_at IS NULL;
ALTER TABLE email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
