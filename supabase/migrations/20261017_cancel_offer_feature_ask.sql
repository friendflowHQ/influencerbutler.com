-- Captures the "what's missing / what's broken" free-text ask shown alongside
-- the 2-months-free retention offer for missing_features / technical_issues
-- cancellations, plus tracking for the manual admin "reach out now" backfill
-- action on rows that already cancelled before this shipped.
--
-- NOTE: prod schema is applied by hand and lags this folder (see
-- 20260721_cancel_survey_expansion.sql, 20260803_winback_funnel.sql). Run this
-- ALTER against the live database before shipping the code that reads/writes
-- these columns, or the writes fail silently.

ALTER TABLE public.subscription_cancel_reasons
  ADD COLUMN IF NOT EXISTS offer_feedback text,
  ADD COLUMN IF NOT EXISTS manual_offer_sent_at timestamptz;
