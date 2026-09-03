-- Per-sequence auto-pause override.
--
-- The email-marketing cron (monitorSequenceHealth) auto-pauses any active
-- sequence once it has a meaningful sample and its bounce/complaint rate crosses
-- the safe threshold, to protect the sending domain. That is all-or-nothing:
-- there is no way to say "this sequence is fine, keep it running."
--
-- auto_pause_enabled = false marks a sequence as EXEMPT: the monitor no longer
-- pauses it. It still watches the numbers and emails the owner when the
-- threshold is crossed (alert, do not pause), so there is no blind spot.
-- Default true, so every existing sequence keeps today's protective behavior
-- until it is deliberately turned off.
--
-- health_alerted_at throttles that alert for an exempt sequence: because it
-- stays active, the old "only flip if still active" de-dup no longer applies, so
-- the monitor re-alerts at most once per 24h while the spike persists.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql. Additive and safe
-- to re-run. The cron and admin API both degrade gracefully (treat auto-pause as
-- enabled / skip the write) until this is applied.

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS auto_pause_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS health_alerted_at TIMESTAMPTZ;
