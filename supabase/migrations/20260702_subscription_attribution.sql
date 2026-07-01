-- Durable affiliate attribution on subscriptions, so recurring renewals are
-- credited to the referring affiliate (not just the first order).
--
-- The initial checkout stamps the intended affiliate into LS custom_data, which
-- order_created + subscription_created persist. But a monthly RENEWAL never goes
-- through our checkout: LS fires subscription_payment_success with no
-- custom_data, so the renewal order landed with a NULL affiliate. That silently
-- broke recurring/lifetime commissions (only month 1 was attributed).
--
-- Fix: store the affiliate on the subscription at creation, then copy it onto
-- each renewal order in subscription_payment_success. attribution_status mirrors
-- the order model: 'live' = LS credited via aff_ref, 'pending' = pre-activation
-- gap (LS credited nothing, we owe the full rate).
--
-- Also adds:
--   orders.ls_subscription_id    link a renewal order back to its subscription.
--   profiles.ls_activated_at     when LS first activated the affiliate (LS has
--                                no activation timestamp of its own); stamped by
--                                the affiliate_activated webhook and admin-link.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that writes these columns,
-- or the subscription_created / renewal handlers will error.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS ref_affiliate_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS ref_affiliate_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS attribution_status TEXT NULL
    CHECK (attribution_status IN ('live', 'pending'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ls_activated_at TIMESTAMPTZ NULL;
