-- Recent-activity widget: allow two more social-proof event kinds.
--
-- Adds 'extension_install' (someone installed the free Chrome extension) and
-- 'trial_start' (someone actually started the 14-day Pro trial, via the Lemon
-- Squeezy on_trial webhook) alongside the original 'trial_click' / 'purchase'.
--
-- The original inline CHECK from 20260618_recent_activity.sql is named
-- activity_events_kind_check by Postgres convention. Dropping it by that name
-- (IF EXISTS) then re-adding the widened constraint is idempotent and safe to
-- paste into the Supabase SQL editor, even if this is re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this in
-- BEFORE deploying the code that writes the new kinds. The writing code is
-- best-effort (never throws), so until this runs the new rows are simply
-- rejected and the widget keeps showing the existing kinds.

ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_kind_check;
ALTER TABLE activity_events ADD CONSTRAINT activity_events_kind_check
  CHECK (kind IN ('trial_click', 'purchase', 'extension_install', 'trial_start'));
