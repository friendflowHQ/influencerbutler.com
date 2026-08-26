-- Trial drip: add a day-11 "3 days left" personal nudge on the 14-day trial.
-- Sits between day7 (halfway) and day13 ("24 hours left"), giving the sequence
-- a personal founder touch three days before the trial converts. Needs its own
-- sent-at column so the /api/cron/affiliate-funnel trial step sends it once.
--
-- Additive and idempotent. Mirrors 20260717_trial_funnel_14day.sql.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_email_day11_sent_at TIMESTAMPTZ;
