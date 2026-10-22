-- Per-user persisted dismissal for dashboard banners (Facebook group invite,
-- free tools, switch-to-annual, event banners, affiliate upsell tiers).
--
-- These banners used to dismiss via sessionStorage only, which clears on
-- every new browser session - so closing the X and logging back in later
-- brought the banner right back. One JSONB column holds a flat map of
-- banner-key -> ISO dismissed-at timestamp, keyed per banner (composite keys
-- like "event_banner:<id>" and "aff_upsell:<tier>" for the banners that have
-- more than one variant):
--   profiles.dashboard_dismissals = { "facebook_group": iso, "free_tools": iso,
--     "annual_switch": iso, "event_banner:<id>": iso, "aff_upsell:<tier>": iso }
--
-- NOTE: prod schema is migrated by hand. Paste this file into the Supabase
-- SQL editor - the banner-dismissals API degrades to persisted: false (the
-- client just keeps the dismissal in memory for that page view) while the
-- column is missing, so order is not critical, but server-side persistence
-- only starts once this is applied.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dashboard_dismissals JSONB;
