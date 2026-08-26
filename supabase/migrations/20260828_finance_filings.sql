-- 1099-NEC filing state per affiliate per tax year.
--
-- Payout totals, tax-form data, and TINs already live in affiliate_payouts /
-- affiliate_tax_forms / affiliate_tax_tins. This table only records the FILING
-- lifecycle (draft -> exported -> filed/corrected, or exempt) plus the amount
-- snapshot at file time so a later clawback can flag a needed correction.
--
-- NOTE: prod Supabase is migrated by hand and lags this folder. The Finance
-- 1099s tab degrades (status controls disabled, exports still work) until this
-- is applied.

CREATE TABLE IF NOT EXISTS affiliate_tax_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year BETWEEN 2020 AND 2100),
  form_type TEXT NOT NULL DEFAULT '1099-NEC',
  -- Snapshot of the year payout total at export/file time (cents). Compared
  -- against the live total to detect a needed correction. Null before export.
  amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'exported', 'filed', 'corrected', 'exempt')),
  method TEXT CHECK (method IN ('iris', 'provider', 'mail')),
  filed_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tax_year)
);
CREATE INDEX IF NOT EXISTS affiliate_tax_filings_year_idx ON affiliate_tax_filings (tax_year);

-- RLS on, NO policies: service-role only (same as affiliate_tax_tins).
ALTER TABLE affiliate_tax_filings ENABLE ROW LEVEL SECURITY;
