-- Finance section: real-time CPA dashboard for the admin area.
--
-- NOTE: prod Supabase is migrated by hand and lags this folder. Until this file
-- is applied in prod, every /api/admin/finance/* route returns
-- { migrationPending: true } instead of erroring.
--
-- 1a. Enrich orders with the Lemon Squeezy money breakdown, normalized to USD
--     cents. LS is merchant of record: `tax` is collected and remitted by LS,
--     so revenue recognition uses (total - tax). Captured going forward by the
--     LS webhook and back-filled for existing rows by
--     /api/admin/finance/backfill-orders.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal_usd_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tax_usd_cents INTEGER,
  ADD COLUMN IF NOT EXISTS total_usd_cents INTEGER,
  ADD COLUMN IF NOT EXISTS refunded_usd_cents INTEGER,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 1b. Manually confirmed bank payouts (LS has no payouts API, so the dashboard
--     estimates the accruing balance and the owner records each actual payout).
CREATE TABLE IF NOT EXISTS finance_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'lemonsqueezy',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  paid_at DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_payouts_paid_at_idx ON finance_payouts (paid_at DESC);

-- 1c. Expenses: manual entries + seed imports. Recurring occurrences are
--     expanded at read time from finance_recurring_expenses, never materialized
--     into this table.
CREATE TABLE IF NOT EXISTS finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT NOT NULL,
  description TEXT,
  -- Schedule C category key, validated in app code (src/lib/finance-expenses.ts).
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  incurred_on DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'seed')),
  -- Idempotency key for seed-import rows, e.g. 'seed:2026-07-01:resend'.
  external_ref TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_expenses_incurred_idx ON finance_expenses (incurred_on DESC);

-- 1d. Recurring monthly subscription templates ("assume it keeps going until
--     marked cancelled"). cancelled_on stops occurrences from that date on.
CREATE TABLE IF NOT EXISTS finance_recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  starts_on DATE NOT NULL,
  cancelled_on DATE,
  note TEXT,
  -- Idempotency key for seed-created templates, e.g. 'seed:recurring:resend'.
  external_ref TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1e. Email step-up (2FA) verification state for the Finance section. One row
--     per staff user; a 6-digit code is emailed, its sha256 hash stored here,
--     and verified_until marks the ~12h window after a correct entry.
CREATE TABLE IF NOT EXISTS finance_stepup (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT,
  code_expires_at TIMESTAMPTZ,
  code_sent_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1f. RLS on with NO policies: service-role only, matching app_config.
ALTER TABLE finance_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_stepup ENABLE ROW LEVEL SECURITY;
