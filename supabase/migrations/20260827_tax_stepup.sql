-- SECURITY (high): email step-up (2FA) for revealing an affiliate's full SSN/TIN.
--
-- Mirrors finance_stepup (20260827_finance.sql). One row per staff user; holds a
-- hashed 6-digit code with an expiry + attempt counter, and a verified_until
-- window. Revealing a decrypted TIN (admin-tax-reveal) requires this window to
-- be open, on top of the affiliates.tax.view permission and super-admin session.
--
-- RLS on with NO policies: service-role only, matching app_config / finance_stepup.
--
-- PROD IS APPLIED BY HAND: run this against prod Supabase after deploy.

CREATE TABLE IF NOT EXISTS tax_stepup (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT,
  code_expires_at TIMESTAMPTZ,
  code_sent_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tax_stepup ENABLE ROW LEVEL SECURITY;
