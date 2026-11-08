-- Comp expiry + comp-to-paid conversion (2026-11-08).
--
-- Adds to comp_grants:
--   kind                          'winback' | 'creator' | 'affiliate', plus the
--                                 system comps 'trial' (no-card trial) and
--                                 'referral' (refer-a-friend reward)
--   user_warn7_sent_at            customer "ends in 7 days" email sent
--   user_warn1_sent_at            customer "ends tomorrow" email sent
--   owner_creator_warn_sent_at    owner "creator comp ends in 7 days, extend?" email sent
--   converted_at                  when the user started a paid plan
--   converted_ls_subscription_id  the paid Lemon Squeezy subscription
--   converted_plan                its plan name
--   first_charge_at               the delayed first charge we set (comp end date)
--
-- Apply by hand in the Supabase SQL editor (prod schema is hand-migrated).
-- Safe to re-run.

ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS user_warn7_sent_at TIMESTAMPTZ;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS user_warn1_sent_at TIMESTAMPTZ;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS owner_creator_warn_sent_at TIMESTAMPTZ;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS converted_ls_subscription_id TEXT;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS converted_plan TEXT;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS first_charge_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comp_grants_kind_check'
  ) THEN
    ALTER TABLE comp_grants
      ADD CONSTRAINT comp_grants_kind_check
      CHECK (kind IS NULL OR kind IN ('winback', 'creator', 'affiliate', 'trial', 'referral'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS comp_grants_user_idx ON comp_grants (user_id);
CREATE INDEX IF NOT EXISTS comp_grants_converted_idx ON comp_grants (converted_at);

-- Backfill kind for existing rows.
-- 1) Affiliate VIP passes carry the issuing affiliate.
UPDATE comp_grants
SET kind = 'affiliate'
WHERE kind IS NULL AND issued_by_affiliate_id IS NOT NULL;

-- 2) Win-back: an in-house comp issued to someone who had a real (non-comp)
--    subscription that was cancelled before the comp was issued.
UPDATE comp_grants g
SET kind = 'winback'
WHERE g.kind IS NULL
  AND g.source = 'in_house'
  AND g.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = g.user_id
      AND s.status IN ('cancelled', 'expired')
      AND s.ls_subscription_id NOT LIKE 'comp:%'
      AND s.ls_subscription_id <> g.ls_subscription_id
      AND COALESCE(s.ends_at, s.created_at) <= g.issued_at
  );

-- 3) No-card 14-day trials are minted as day-based comps (code ends FREE14D).
UPDATE comp_grants
SET kind = 'trial'
WHERE kind IS NULL AND months IS NULL AND discount_code LIKE '%FREE14D';

-- 4) Everything else is labeled a creator / collab comp. Review the labels on
--    the admin Comps page (the Kind column is editable) for referral rewards.
UPDATE comp_grants SET kind = 'creator' WHERE kind IS NULL;

-- Comps that already converted: a later live paid subscription for the same user.
UPDATE comp_grants g
SET converted_at = s.created_at,
    converted_ls_subscription_id = s.ls_subscription_id,
    converted_plan = s.plan_name
FROM subscriptions s
WHERE g.converted_at IS NULL
  AND g.user_id IS NOT NULL
  AND s.user_id = g.user_id
  AND s.ls_subscription_id NOT LIKE 'comp:%'
  AND s.ls_subscription_id <> g.ls_subscription_id
  AND s.status IN ('active', 'on_trial', 'past_due')
  AND s.created_at >= g.issued_at;
