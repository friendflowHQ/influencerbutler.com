-- Per-step conversion tracking for custom drip sequences.
--
-- The email-marketing cron already detects conversions every run: its
-- stop-on-subscribe pass matches an enrolled address against liveSubscriberEmails
-- (anyone now trialing or paid) and cancels them out of the drip. That match IS
-- the conversion event, and at that moment we know the last step they received
-- (last_step_sent). These columns let us keep that signal instead of discarding
-- it, so each conversion is attributed last-touch to the step that earned it.
--
--   converted_at    when the enrollee became a live subscriber (cron stamps now()).
--   converted_step  last_step_sent at conversion time (0 = converted before any
--                   step landed; e.g. signed up between enroll and first send).
--
-- Aggregated by GET /api/admin/emails/sequences into per-step + per-sequence
-- conversion counts for the Sequences tab. A converted enrollment is also
-- cancelled (converted_at and cancelled_at are set together), so it leaves the
-- active backlog exactly as before.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql. Additive and safe
-- to re-run. The cron and admin API both degrade gracefully (skip the write /
-- report zero conversions) until this is applied.

ALTER TABLE email_sequence_enrollments
  ADD COLUMN IF NOT EXISTS converted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_step INT;

-- Small partial index: reporting only ever scans the converted rows.
CREATE INDEX IF NOT EXISTS email_sequence_enrollments_converted_idx
  ON email_sequence_enrollments (sequence_id, converted_step)
  WHERE converted_at IS NOT NULL;
