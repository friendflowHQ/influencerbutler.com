-- Consumer "invite a friend" referral loop (give a friend a free month, get a
-- free month). Distinct from the affiliate program (which pays cash commission):
-- this rewards ordinary users with free Pro for spreading the word.
--
-- Flow (all gated behind REFERRAL_PROGRAM_ENABLED):
--   1. Each user gets a referral_code + a /r/<code> share link.
--   2. A friend who clicks it and signs up gets a free month of Pro (an in-house
--      comp) and a referrals row is created (status 'pending').
--   3. When that friend converts to a paying customer, the referrer is rewarded
--      with their own free month: a real Pro comp if they are on the free tier,
--      or a transferable "gift a friend" pass if they already pay (Lemon Squeezy
--      cannot credit a free month onto an active subscription). The row flips to
--      'converted'.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor before enabling REFERRAL_PROGRAM_ENABLED. Every code
-- path that reads these is best-effort and no-ops if they are missing, so the
-- deploy can lead the migration.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_upper_unique_idx
  ON profiles (UPPER(referral_code))
  WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id          UUID NOT NULL,
  referrer_code             TEXT NOT NULL,
  referred_email            TEXT,
  referred_user_id          UUID,
  status                    TEXT NOT NULL DEFAULT 'pending', -- pending | converted
  friend_comp_issued_at     TIMESTAMPTZ,
  referrer_reward_issued_at TIMESTAMPTZ,
  referrer_reward_kind      TEXT, -- 'comp' (free-tier referrer) | 'gift_pass' (paying referrer)
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON referrals (referrer_user_id, created_at DESC);

-- One referral row per referred user, so a friend can only be counted once and
-- the conversion reward fires at most once.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_unique
  ON referrals (referred_user_id)
  WHERE referred_user_id IS NOT NULL;

-- Service-role only: all reads/writes go through the admin client in our server
-- routes (mirrors email_subscribers / affiliate tables).
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
