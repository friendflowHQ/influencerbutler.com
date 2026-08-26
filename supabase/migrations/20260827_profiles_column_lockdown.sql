-- SECURITY (critical): stop users self-granting affiliate status / commission /
-- payout destination via a direct PostgREST PATCH on their own profiles row.
--
-- Background: own_profile_update (20260520_profile_fields.sql) is
--   FOR UPDATE USING (auth.uid() = id)
-- with no column restriction, and the anon/authenticated roles hold UPDATE on
-- every column of public.profiles. A logged-in user could therefore
--   PATCH /rest/v1/profiles?id=eq.<own-id>  { "commission_percent": 100,
--                                             "is_affiliate": true,
--                                             "paypal_email": "attacker@..." }
-- and rewrite the exact columns that drive payout eligibility, rate, and
-- destination. Confirmed against prod: such a PATCH returned 204, not a
-- permission error.
--
-- Fix: revoke blanket UPDATE from the public roles and re-grant it ONLY on the
-- columns the user's own /profile page legitimately edits via the RLS client
-- (display_name, username, avatar_url, avatar_updated_at). Every other column is
-- written exclusively through the service-role client in server routes, which
-- bypasses these grants, so nothing app-side breaks. The own_profile_update RLS
-- policy stays as the row-scoping second layer.
--
-- PROD IS APPLIED BY HAND: run this against prod Supabase after deploy.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (display_name, username, avatar_url, avatar_updated_at)
  ON public.profiles TO authenticated;
