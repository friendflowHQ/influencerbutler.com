-- Affiliate payout destination. The self-hosted program pays commissions
-- ourselves via PayPal Payouts, so each affiliate stores where to send it.
-- A PayPal email is a payout destination, not a credential.
--
-- PROD IS APPLIED BY HAND: paste into the Supabase SQL editor BEFORE deploying
-- code that reads/writes these columns.

alter table public.profiles
  add column if not exists paypal_email text,
  add column if not exists payout_method text not null default 'paypal',
  add column if not exists payout_updated_at timestamptz;
