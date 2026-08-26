-- Lead source (channel) for affiliate-referred accounts, powering the "By
-- source" breakdown and the per-event source label in the affiliate
-- dashboard "Referred signups" feed. First-touch, per-account: set once by
-- whichever attribution path captured the referral credit first.
--   'web'       : ib_aff_src cookie -> captureSignupReferral (free signups)
--   'extension' : attributeExtensionReferral via /api/extension/auth/check
--   'desktop'   : desktop app activation (Phase 2)
--
-- Accounts referred by a direct paid checkout (no free-signup precursor, so no
-- profiles row stamp here) are inferred as 'web' by the funnel derivation,
-- since a direct checkout always happens on the website.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying. If the order slips nothing breaks:
-- the capture helpers warn and skip the column, the data layer retries a
-- reduced select without ref_channel, and the feed labels those events 'web'.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ref_channel TEXT NULL
  CHECK (ref_channel IN ('web', 'extension', 'desktop'));
