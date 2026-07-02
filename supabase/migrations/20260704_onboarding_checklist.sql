-- Getting-started checklist state (dashboard Overview).
--
-- Most checklist steps are derived live (subscription status, license
-- activations, profile completeness, testimonial submitted); only the
-- manual bits need persistence: when the user clicked a download link and
-- when they dismissed the checklist. One JSONB column keeps that tidy:
--   profiles.onboarding = { "downloaded_at": iso, "dismissed_at": iso }
--
-- NOTE: prod schema is migrated by hand. Paste this file into the Supabase
-- SQL editor before (or after) deploying - the getting-started API degrades
-- to localStorage persistence while the column is missing, so order is not
-- critical, but server-side persistence only starts once this is applied.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding JSONB;
