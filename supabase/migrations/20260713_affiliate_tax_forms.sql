-- Affiliate tax certification forms (W-9 / W-8BEN / W-8BEN-E).
--
-- Self-hosted affiliate program: we became the payer, so we collect the tax
-- form ourselves and issue 1099-NECs. This row holds the NON-SENSITIVE fields
-- and is readable by the affiliate. The raw TIN lives ENCRYPTED in the sibling
-- table affiliate_tax_tins (service-role only) - see 20260713_affiliate_tax_tins.sql.
--
-- Writes go through the service-role submit / admin-verify routes (which force
-- the status transitions), so affiliates get SELECT only - they cannot mark
-- their own form 'verified'.
--
-- PROD IS APPLIED BY HAND: prod Supabase lags this folder. Paste this into the
-- Supabase SQL editor BEFORE deploying code that reads/writes these columns, or
-- the tax-form routes 500 (see the migration-drift note in project memory).

create table if not exists public.affiliate_tax_forms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  form_type text not null check (form_type in ('W-9', 'W-8BEN', 'W-8BEN-E')),
  legal_name text not null,
  business_name text,
  tax_classification text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  tin_last4 text,
  tin_kind text check (tin_kind in ('ssn', 'ein', 'itin', 'foreign')),
  treaty_country text,
  treaty_rate numeric,
  signature_name text,
  signature_date date,
  certified boolean not null default false,
  status text not null default 'submitted'
    check (status in ('not_submitted', 'submitted', 'verified', 'rejected')),
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.affiliate_tax_forms enable row level security;

-- Affiliates read only their own form (status + last4 for display). All writes
-- are service-role (bypasses RLS) so status can only be set by our routes.
drop policy if exists own_tax_form_select on public.affiliate_tax_forms;
create policy own_tax_form_select on public.affiliate_tax_forms
  for select using (auth.uid() = user_id);
