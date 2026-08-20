-- Loyalty discounts + affiliate make-whole adjustments.
--
-- Two linked records that let support honor a deeper discount for a referred
-- customer WITHOUT quietly cutting the referring affiliate's commission:
--
--   customer_discount_grants        - the customer-side record of a support/
--                                     loyalty discount applied to their LS sub.
--   affiliate_commission_adjustments - the missing ledger primitive: a manual
--                                     amount owed to an affiliate (e.g. the
--                                     make-whole difference), with a note the
--                                     affiliate sees. Settled by an ad-hoc
--                                     affiliate_payouts row (period null), which
--                                     is what 1099 + Xero exports read, so the
--                                     amount reconciles across every surface.
--
-- Adjustments are intentionally SEPARATE from the order-derived owed total the
-- automated PayPal disburse pays (see paypal-payouts.ts). Disburse stamps
-- orders.reconciled_* on success; it does not know about adjustments, so folding
-- adjustments into that owed total would double-pay them. Instead each
-- adjustment is paid via its own manual "mark paid" action that writes an ad-hoc
-- affiliate_payouts row and stamps reconciled_at + payout_id here.
--
-- PROD IS APPLIED BY HAND: paste into the Supabase SQL editor BEFORE deploy.

-- 1) Customer-side loyalty discount record ----------------------------------
create table if not exists public.customer_discount_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- the customer
  ls_subscription_id text,
  -- The net price the affiliate referred them at (basis for the make-whole),
  -- the new discounted price, and the percent off, all captured at grant time.
  referred_price_cents integer,
  new_price_cents integer,
  discount_pct integer,
  ls_discount_id text,            -- the LS discount created/applied, when any
  label text not null default 'Loyalty discount',
  affiliate_user_id uuid references auth.users(id) on delete set null,
  note text,
  status text not null default 'applied'
    check (status in ('applied', 'failed', 'manual')),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists customer_discount_grants_user_idx
  on public.customer_discount_grants (user_id, created_at);
create index if not exists customer_discount_grants_affiliate_idx
  on public.customer_discount_grants (affiliate_user_id);

alter table public.customer_discount_grants enable row level security;

-- The customer may read their own grants; all writes are service-role.
drop policy if exists own_discount_grants_select on public.customer_discount_grants;
create policy own_discount_grants_select on public.customer_discount_grants
  for select using (auth.uid() = user_id);

-- 2) Affiliate make-whole / manual adjustment ledger ------------------------
create table if not exists public.affiliate_commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- the affiliate
  amount_cents integer not null,
  currency text not null default 'USD',
  note text,                      -- shown to the affiliate (dashboard + statement)
  source text not null default 'makewhole'
    check (source in ('makewhole', 'manual')),
  related_grant_id uuid references public.customer_discount_grants(id) on delete set null,
  related_customer text,          -- customer email / order id, admin context only
  period text,                    -- 'YYYY-MM' this adjustment belongs to
  created_by text,
  created_at timestamptz not null default now(),
  -- Settlement mirrors how orders reconcile: stamped when the ad-hoc payout that
  -- covers this adjustment succeeds, so it stops showing as owed.
  reconciled_at timestamptz,
  payout_id uuid references public.affiliate_payouts(id)
);

-- Grouping index for "what does this affiliate still owe" + settlement lookups.
create index if not exists affiliate_commission_adjustments_user_open_idx
  on public.affiliate_commission_adjustments (user_id, reconciled_at);

alter table public.affiliate_commission_adjustments enable row level security;

-- Affiliates read their own adjustments (so the dashboard can show them + the
-- note); all writes are service-role.
drop policy if exists own_adjustments_select on public.affiliate_commission_adjustments;
create policy own_adjustments_select on public.affiliate_commission_adjustments
  for select using (auth.uid() = user_id);
