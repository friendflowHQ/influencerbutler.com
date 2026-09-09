-- Public leaderboard opt-in.
--
-- The /leaderboard page ranks affiliates by referral count. By default an
-- affiliate appears only as masked initials (e.g. "A.M."); setting this flag
-- true lets them show their chosen public handle (username / display_name)
-- instead. There is no other public-display consent flag on profiles, so this
-- is the single source of truth for "may I be named on the public board".
--
-- Writes happen through a service-role API route (/api/affiliates/leaderboard-optin)
-- after authenticating the affiliate, so we deliberately do NOT add this column
-- to the anon/authenticated UPDATE grant established in
-- 20260827_profiles_column_lockdown.sql.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.public_leaderboard_opt_in IS
  'Affiliate consented to being named (handle/display_name) on the public /leaderboard. Default false = show masked initials only.';
