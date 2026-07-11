-- In-house comps: let the owner mint a free Pro grant entirely in Supabase,
-- without a Lemon Squeezy (LS) subscription. Pro is granted by inserting a
-- synthetic `subscriptions` row (status 'active') for the recipient; the comp is
-- tracked here with source = 'in_house' so the cancel path flips the Supabase
-- status directly instead of calling LS DELETE (which has no subscription to
-- cancel). LS-originated comps keep source = 'lemonsqueezy' and cancel via LS.
--
-- NOTE: prod schema is migrated by hand (see the header of
-- 20260711_comp_grants.sql). Paste this into the Supabase SQL editor before
-- deploying the in-house comp code. Safe to run more than once.
--
-- Sentinel note: in-house comps store a synthetic `comp:<uuid>` value in both
-- comp_grants.ls_subscription_id and subscriptions.ls_subscription_id (that
-- column is UNIQUE and may be NOT NULL in prod - the sentinel satisfies both).
-- Verify subscriptions.ls_subscription_id's nullability directly in Supabase if
-- in doubt; the sentinel approach works either way.

ALTER TABLE comp_grants
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'lemonsqueezy'
  CHECK (source IN ('lemonsqueezy', 'in_house'));

-- The in-house license key minted for this comp (FK to license_keys.id), so the
-- cancel path can optionally revoke it. Null for LS-originated comps.
ALTER TABLE comp_grants
  ADD COLUMN IF NOT EXISTS license_key_id UUID;
