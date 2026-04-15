-- Branded affiliate discount codes
-- Each approved affiliate gets their own LS discount code (usually their first
-- name). When a customer types the code on /dashboard/subscription, our
-- /api/checkout endpoint looks up the affiliate and credits them via LS's
-- native aff_ref attribution in the generated checkout URL.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS affiliate_code TEXT,
  ADD COLUMN IF NOT EXISTS ls_affiliate_discount_id TEXT;

-- Case-insensitive uniqueness so "john" and "JOHN" can't collide.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_affiliate_code_upper_unique_idx
  ON profiles (UPPER(affiliate_code))
  WHERE affiliate_code IS NOT NULL;
