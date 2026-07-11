-- Encrypted TIN/SSN storage for affiliate tax forms.
--
-- AES-256-GCM ciphertext, IV, and auth tag stored base64 in text columns. The
-- key lives OUTSIDE the database in TAX_FORM_ENCRYPTION_KEY (see
-- src/lib/tax-crypto.ts), so a DB dump or a leaked service-role key alone cannot
-- decrypt a TIN. RLS is enabled with NO policy: only the service-role client
-- (which bypasses RLS) can touch this table, and only inside the affiliate
-- submit route and the super-admin reveal route. Every reveal is audited.
--
-- PROD IS APPLIED BY HAND: paste into the Supabase SQL editor BEFORE deploy.

create table if not exists public.affiliate_tax_tins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tin_ciphertext text not null,
  tin_iv text not null,
  tin_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on, intentionally NO policies: this table is service-role only. Enabling
-- RLS without a permissive policy denies every anon/authenticated session.
alter table public.affiliate_tax_tins enable row level security;
