-- Per-user admin notes + comp make-whole adjustment source.
--
-- Two small, unrelated schema additions bundled for one hand-apply:
--
--   user_notes  - a freeform, timestamped internal note log an admin can attach
--                 to any account from the Users page ("why did we do X on this
--                 account"). Append-only from the UI (add + delete), never shown
--                 to the end user; all writes are service-role.
--
--   affiliate_commission_adjustments.source - widen the CHECK to allow 'comp',
--                 so a make-whole recorded when a referred customer is COMPED
--                 (paid sub cancelled -> free 100%-off comp) is distinguishable
--                 from the price-discount 'makewhole' rows. It still settles
--                 through the same admin-makewhole-pay path (source-agnostic).
--
-- PROD IS APPLIED BY HAND: paste into the Supabase SQL editor BEFORE deploy.

-- 1) Per-user admin note log ------------------------------------------------
create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- the customer
  body text not null,
  created_by text,                    -- actor email / user id
  created_at timestamptz not null default now()
);

-- Newest-first listing per user.
create index if not exists user_notes_user_idx
  on public.user_notes (user_id, created_at desc);

-- Admin-only surface: RLS on with no end-user policy, so only the service-role
-- client (which bypasses RLS) can read or write.
alter table public.user_notes enable row level security;

-- 2) Allow 'comp' as an affiliate adjustment source -------------------------
alter table public.affiliate_commission_adjustments
  drop constraint if exists affiliate_commission_adjustments_source_check;
alter table public.affiliate_commission_adjustments
  add constraint affiliate_commission_adjustments_source_check
  check (source in ('makewhole', 'manual', 'comp'));
