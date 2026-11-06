-- SECURITY: own_app_update_pending (20260415_affiliates.sql) is
--   FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
-- with no column restriction, and Supabase grants blanket table-level UPDATE
-- to authenticated by default. A pending applicant can therefore PATCH any
-- column on their own row, including admin_notes (staff-only) and the
-- funnel/activation timestamp columns that drive automated emails and comp
-- grants. They cannot flip status away from 'pending' (the policy's USING
-- clause doubles as the implicit WITH CHECK on the new row), but the other
-- columns are wide open. Same anti-pattern as 20260827_profiles_column_lockdown.sql
-- and 20261007_community_author_email_lockdown.sql.
--
-- Fix: revoke blanket UPDATE from authenticated and re-grant it only on the
-- columns an applicant legitimately edits via their own form (the fields
-- collected at application time). Every other column (status, admin_notes,
-- reviewed_at, the activation/conversion timestamps, the discount code) is
-- written exclusively through the service-role client in server routes,
-- which bypasses these grants.

REVOKE UPDATE ON public.affiliate_applications FROM authenticated;

GRANT UPDATE (
  email,
  full_name,
  website,
  social_handles,
  audience_size,
  niche,
  promotion_strategy,
  agreed_to_terms,
  country
) ON public.affiliate_applications TO authenticated;
