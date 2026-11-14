-- App-trial "your own posts" summary for the day 12 email (2026-11-16).
-- The desktop app reports, once a day, how many of a trial user's own
-- storefront posts have a live deal, a live sale-event deal or an open
-- Creator Connections campaign (counts only; see src/lib/app-trial-posts.ts).
-- Apply by hand in the Supabase SQL editor. Until applied, the upload route
-- answers ok without storing and the day 12 email simply has no posts line;
-- nothing else in the app-trial cron reads these columns.

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS app_trial_posts_summary JSONB,
  ADD COLUMN IF NOT EXISTS app_trial_posts_summary_at TIMESTAMPTZ;
