-- Affiliate payout ledger. One row per PayPal Payouts disbursement (or a manual
-- break-glass payout). This is the real record of money paid, replacing the old
-- reconciled_* stamps on orders as the primary payout record.
--
-- Idempotency is load-bearing for money: sender_batch_id is UNIQUE and computed
-- deterministically BEFORE the PayPal call, so a double-click or webhook replay
-- cannot create a second batch. Orders covered by a payout are stamped
-- orders.payout_id + reconciled_* only when the payout item actually SUCCEEDS
-- (via the PayPal webhook / poller), so a failed/unclaimed payout leaves those
-- orders unreconciled and they reappear as owed.
--
-- PROD IS APPLIED BY HAND: paste into the Supabase SQL editor BEFORE deploy.

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text, -- 'YYYY-MM' for a monthly payout, or null for ad-hoc
  gross_cents integer not null,
  currency text not null default 'USD',
  fee_note text,
  order_ids jsonb not null default '[]'::jsonb, -- ls_order_id[] this payout covers
  paypal_email text, -- snapshot of the destination at send time
  sender_batch_id text not null unique,
  sender_item_id text,
  paypal_batch_id text,
  paypal_item_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'success', 'failed', 'unclaimed', 'returned', 'blocked', 'denied')),
  error_note text,
  created_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Grouping index for per-affiliate paid-to-date and year-end 1099 rollups.
create index if not exists affiliate_payouts_user_status_paid_idx
  on public.affiliate_payouts (user_id, status, paid_at);

alter table public.affiliate_payouts enable row level security;

-- Affiliates read their own payout history; all writes are service-role.
drop policy if exists own_payouts_select on public.affiliate_payouts;
create policy own_payouts_select on public.affiliate_payouts
  for select using (auth.uid() = user_id);

-- Link orders to the payout that settled them (set only on payout success).
alter table public.orders
  add column if not exists payout_id uuid references public.affiliate_payouts(id);
