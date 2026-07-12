-- Immutable audit trail for affiliate tax-form certifications (W-9 / W-8BEN / W-8BEN-E).
--
-- affiliate_tax_forms holds ONE current-state row per affiliate (upsert on
-- user_id), so a re-submission overwrites the prior signing. This table is
-- APPEND-ONLY: one row is inserted for every certified submission, recording
-- what was signed, by whom, from where, and when. This is the record we can
-- produce if a signed W-9 / W-8 is ever challenged.
--
-- Stores only tin_last4 (never the raw TIN, which stays encrypted in
-- affiliate_tax_tins) and the exact certification wording the affiliate agreed
-- to (from src/lib/tax-certification.ts).
--
-- PROD IS APPLIED BY HAND: prod Supabase lags this folder. Paste this into the
-- Supabase SQL editor BEFORE deploying code that writes this table, or the
-- tax-form POST route's audit insert fails (see the migration-drift note in
-- project memory).

create table if not exists public.affiliate_tax_form_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_type text not null check (form_type in ('W-9', 'W-8BEN', 'W-8BEN-E')),
  legal_name text,
  signature_name text,
  signature_date date,
  certified boolean not null,
  tin_last4 text,
  tin_kind text check (tin_kind in ('ssn', 'ein', 'itin', 'foreign')),
  certification_text text,
  ip text,
  user_agent text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists affiliate_tax_form_events_user_idx
  on public.affiliate_tax_form_events (user_id, submitted_at desc);

alter table public.affiliate_tax_form_events enable row level security;

-- Affiliates read only their own signing history. There is NO insert/update/
-- delete policy: all inserts go through the service-role submit route, and the
-- table is append-only (nothing may edit or remove a recorded certification).
drop policy if exists own_tax_form_events_select on public.affiliate_tax_form_events;
create policy own_tax_form_events_select on public.affiliate_tax_form_events
  for select using (auth.uid() = user_id);
