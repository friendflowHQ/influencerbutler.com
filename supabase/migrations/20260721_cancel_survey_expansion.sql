-- Expands the cancellation questionnaire captured in subscription_cancel_reasons.
--
-- Adds buying-intent columns (intended_outcome, would_return) and the plumbing
-- for an emailed survey that catches cancellations which never went through our
-- in-app cancel funnel (source, survey_token, emailed_at, completed_at).
--
-- NOTE: prod schema is applied by hand and lags this folder. Run this ALTER
-- against the live database BEFORE the code that reads/writes these columns
-- ships, or those writes fail silently.

ALTER TABLE public.subscription_cancel_reasons
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS intended_outcome text,
  ADD COLUMN IF NOT EXISTS would_return text,
  ADD COLUMN IF NOT EXISTS survey_token text,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- One survey email per subscription: the token is the unlogged-in survey page's
-- authorization, so it must be unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_cancel_reasons_survey_token_idx
  ON public.subscription_cancel_reasons(survey_token)
  WHERE survey_token IS NOT NULL;

-- Lets the webhook cheaply check "did this subscription already leave a reason?"
CREATE INDEX IF NOT EXISTS subscription_cancel_reasons_subscription_id_idx
  ON public.subscription_cancel_reasons(subscription_id);
