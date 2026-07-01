-- Per-affiliate commission terms (custom rate + duration).
--
-- Lemon Squeezy pays every affiliate a flat 30% for a subscription's first 12
-- months. Some affiliates are promised more (e.g. Samantha at 70% for the
-- lifetime of every customer she refers). We honor that by topping up the gap
-- between their promised rate and what LS actually paid, calculated from the
-- orders table and paid out monthly.
--
-- commission_percent          the affiliate's total promised rate (e.g. 70).
--                             NULL falls back to the 30% default.
-- commission_duration_months  how long we honor the elevated rate, counted from
--                             each referred customer's first order. NULL = for
--                             the lifetime of the customer (never expires); a
--                             positive integer honors it for that many months.
-- commission_terms_updated_*  audit of who last changed the terms and when.
--
-- The owed math lives in src/lib/affiliate-commissions.ts and is consumed by the
-- Owed tab, the Payouts tab, the statement emails, and the monthly cron.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that reads these columns, or
-- the roster / payouts reads will error.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_percent INTEGER NULL
    CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100)),
  ADD COLUMN IF NOT EXISTS commission_duration_months INTEGER NULL
    CHECK (commission_duration_months IS NULL OR commission_duration_months > 0),
  ADD COLUMN IF NOT EXISTS commission_terms_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS commission_terms_updated_by TEXT NULL;
