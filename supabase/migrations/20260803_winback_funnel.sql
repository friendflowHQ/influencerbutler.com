-- Win-back email funnel state, tracked per cancellation row.
--
-- The /api/cron/winback drip sends up to three touches (Day 7 / 21 / 45 after
-- the cancel) to churned customers, offering either a free-time comp key (claim
-- link) or a Lemon Squeezy re-subscribe discount, segmented by cancel reason.
-- These columns make each tier idempotent and record what was offered/claimed:
--   winback_t1/t2/t3_sent_at : one send-timestamp per tier (stamped on success)
--   winback_discount_code     : the COMEBACK code minted once for the discount
--                               segment and reused in the later tier
--   winback_comp_claimed_at   : when the recipient clicked the claim link and a
--   winback_comp_grant_id       comp was issued (+ the resulting comp_grants id)
--
-- NOTE: prod schema is applied by hand and lags this folder. Run this ALTER
-- against the live database BEFORE the win-back code ships, or those writes fail
-- silently (the cron would resend every run, having never stamped a tier).

ALTER TABLE public.subscription_cancel_reasons
  ADD COLUMN IF NOT EXISTS winback_t1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_t2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_t3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_discount_code text,
  ADD COLUMN IF NOT EXISTS winback_comp_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_comp_grant_id uuid;
