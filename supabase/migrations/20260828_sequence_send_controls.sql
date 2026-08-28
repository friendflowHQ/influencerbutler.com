-- Sequence send controls: per-sequence throttle + auto-pause bookkeeping.
--
-- Adds a rate cap so a custom drip can be slowed to a safe warmup pace, plus
-- fields to record when the cron auto-paused a sequence (bounce/complaint spike)
-- and why. All nullable / additive; safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql.

ALTER TABLE email_sequences
  -- Max emails/hour for THIS sequence. NULL = use the cron's global default.
  ADD COLUMN IF NOT EXISTS sends_per_hour INT,
  -- Set by the cron's monitor when it auto-pauses on a bounce/complaint spike.
  ADD COLUMN IF NOT EXISTS auto_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;
