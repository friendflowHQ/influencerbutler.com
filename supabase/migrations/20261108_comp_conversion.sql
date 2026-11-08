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

-- Backfill kind for existing rows. Order matters: the most specific rules run
-- first and each only touches rows still unlabeled.

-- 1) Affiliate VIP passes carry the issuing affiliate.
UPDATE comp_grants
SET kind = 'affiliate'
WHERE kind IS NULL AND issued_by_affiliate_id IS NOT NULL;

-- 2) No-card 14-day trials are minted as day-based comps (code ends FREE14D).
UPDATE comp_grants
SET kind = 'trial'
WHERE kind IS NULL AND months IS NULL AND discount_code LIKE '%FREE14D';

-- 3) Affiliate activation comps: 30-day comps (code ends FREE30D) given to an
--    affiliate's own account.
UPDATE comp_grants g
SET kind = 'affiliate'
FROM profiles p
WHERE g.kind IS NULL
  AND g.discount_code LIKE '%FREE30D'
  AND p.id = g.user_id
  AND p.is_affiliate = true;

-- 4) Refer-a-friend rewards: the friend's comp, or the referrer's comp reward,
--    issued within a day of the referral row recording it. Skipped when the
--    referrals table is not in this database.
DO $$
BEGIN
  IF to_regclass('public.referrals') IS NOT NULL THEN
    UPDATE comp_grants g
    SET kind = 'referral'
    WHERE g.kind IS NULL
      AND g.user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM referrals r
        WHERE (
            r.referred_user_id = g.user_id
            AND r.friend_comp_issued_at IS NOT NULL
            AND abs(extract(epoch FROM (r.friend_comp_issued_at - g.issued_at))) < 86400
          ) OR (
            r.referrer_user_id = g.user_id
            AND r.referrer_reward_kind = 'comp'
            AND r.referrer_reward_issued_at IS NOT NULL
            AND abs(extract(epoch FROM (r.referrer_reward_issued_at - g.issued_at))) < 86400
          )
      );
  END IF;
END $$;

-- 5) Win-back: an in-house comp issued to someone who had a real, PAID
--    subscription (at least one charged order, so not a lapsed card trial and
--    not another comp) that ended before the comp was issued.
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
      AND s.ls_subscription_id NOT IN (SELECT ls_subscription_id FROM comp_grants)
      AND COALESCE(s.ends_at, s.created_at) <= g.issued_at
      AND EXISTS (
        -- Initial orders carry no ls_subscription_id, so match the customer's
        -- own charged orders from before the comp.
        SELECT 1 FROM orders o
        WHERE (o.ls_subscription_id = s.ls_subscription_id OR o.user_id = s.user_id)
          AND o.total > 0
          AND o.created_at <= g.issued_at
      )
  );

-- 6) Everything else is labeled a creator / collab comp. Review the labels on
--    the admin Comps page (the kind dropdown is editable).
UPDATE comp_grants SET kind = 'creator' WHERE kind IS NULL;

-- Comps that already converted: a later live paid plan for the same user. Not
-- another comp, not the Deals add-on (it stacks on a plan), not no-card trials.
-- first_charge_at is set to the conversion time so the cron's delayed-charge
-- retry never touches these historical subscriptions (their billing dates were
-- set before this feature existed).
UPDATE comp_grants g
SET converted_at = s.created_at,
    converted_ls_subscription_id = s.ls_subscription_id,
    converted_plan = s.plan_name,
    first_charge_at = s.created_at
FROM subscriptions s
WHERE g.converted_at IS NULL
  AND g.kind IS DISTINCT FROM 'trial'
  AND g.user_id IS NOT NULL
  AND s.user_id = g.user_id
  AND s.ls_subscription_id NOT LIKE 'comp:%'
  AND s.ls_subscription_id NOT IN (SELECT ls_subscription_id FROM comp_grants)
  AND COALESCE(s.plan_name, '') NOT ILIKE '%workspace%'
  AND s.status IN ('active', 'on_trial', 'past_due')
  AND s.created_at >= g.issued_at;
