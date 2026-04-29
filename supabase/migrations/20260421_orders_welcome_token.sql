-- Per-purchase token used to identify the buyer on the /welcome thank-you page
-- without requiring authentication. Set as a cookie before the LS checkout
-- redirect, passed through LS as custom_data.welcome_token, and stored here by
-- the order_created webhook. The /api/welcome/license endpoint reads the cookie
-- and joins orders -> subscriptions -> license_keys to surface the just-issued
-- license key to the buyer immediately, without making them click a magic-link
-- email first. Time-windowed in the API (only orders created within the last
-- hour are considered) so a leaked cookie value can't pull license keys for
-- old purchases.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS welcome_token TEXT;

CREATE INDEX IF NOT EXISTS orders_welcome_token_idx
  ON orders (welcome_token)
  WHERE welcome_token IS NOT NULL;
