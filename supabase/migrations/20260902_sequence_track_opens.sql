-- Per-sequence open/click tracking opt-in.
--
-- Sequence steps are sent as PLAIN TEXT (see the email-marketing cron), which is
-- great for cold-outreach deliverability but means Resend has nowhere to inject
-- its open-tracking pixel, so opens can never be recorded for them. delivered /
-- bounced still record (those events need no pixel); only opens/clicks are dark.
--
-- track_opens = true makes the cron additionally send a minimal HTML body for
-- that sequence so Resend injects the pixel and wraps links. Off by default, so
-- every existing sequence keeps its text-only behavior until it is turned on.
-- Enable it deliberately per sequence (the two cold Amazon-influencer drips
-- want it); note it adds a tracking pixel, a small deliverability tradeoff on
-- cold lists.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql. Additive and safe
-- to re-run. The cron and admin API both degrade gracefully (treat the column
-- as false / skip the write) until this is applied.

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS track_opens BOOLEAN NOT NULL DEFAULT false;
