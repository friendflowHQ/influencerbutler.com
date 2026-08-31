-- Sequence fixed send hour: pin a drip's steps to a predictable time of day.
--
-- Without this, a "day 3" step fires at the same wall-clock minute each person
-- happened to enroll. send_hour (0-23) instead sends at that hour, Mountain
-- Time (America/Denver, the business timezone), on the first occurrence at or
-- after the day offset. NULL keeps the original enrollment-minute behavior.
-- Additive and safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql.

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS send_hour SMALLINT;

ALTER TABLE email_sequences
  DROP CONSTRAINT IF EXISTS email_sequences_send_hour_range;

ALTER TABLE email_sequences
  ADD CONSTRAINT email_sequences_send_hour_range
  CHECK (send_hour IS NULL OR (send_hour >= 0 AND send_hour <= 23));
