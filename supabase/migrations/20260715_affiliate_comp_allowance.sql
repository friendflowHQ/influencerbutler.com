-- Affiliate comp allowance: let trusted ("main squeeze") affiliates hand out a
-- limited free Pro workspace to a prospect, so they have wiggle room to convert.
--
-- An affiliate can only issue comps if an admin has enabled them by setting a
-- monthly quota. Every comp they issue is a 1-seat Solo Pro workspace capped at
-- a 2-month (60-day) window, minted through the existing in-house comp machinery
-- (see src/lib/comp-issue.ts) and auto-cancelled at expiry by the comp-expiry
-- cron. These columns add the per-affiliate enablement + quota, and record which
-- affiliate issued each comp so the quota can be counted and the admin Comps
-- page can attribute it.
--
-- affiliate_comp_monthly_quota  NULL / 0 = the affiliate cannot comp; a positive
--                               integer = how many comps they may issue per
--                               calendar month.
-- affiliate_comp_updated_*      audit of who last changed the allowance and when.
-- comp_grants.issued_by_affiliate_id  the affiliate user_id that issued the comp
--                               (NULL for admin-issued or Lemon-Squeezy comps).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that reads these columns, or
-- the roster / affiliate-comps reads will error.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS affiliate_comp_monthly_quota INTEGER NULL
    CHECK (affiliate_comp_monthly_quota IS NULL OR affiliate_comp_monthly_quota >= 0),
  ADD COLUMN IF NOT EXISTS affiliate_comp_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS affiliate_comp_updated_by TEXT NULL;

ALTER TABLE comp_grants
  ADD COLUMN IF NOT EXISTS issued_by_affiliate_id UUID NULL;

CREATE INDEX IF NOT EXISTS comp_grants_issued_by_affiliate_id_idx
  ON comp_grants (issued_by_affiliate_id);
