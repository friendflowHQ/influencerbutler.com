-- Utah use-tax tracking on expenses.
--
-- Distinct from income tax (the quarterly planner) and from Lemon Squeezy's
-- merchant-of-record sales-tax remittance on our SALES. This is use tax on our
-- PURCHASES: Utah charges use tax when a vendor did not already collect Utah
-- sales tax on a taxable item (notably remotely-accessed prewritten software /
-- SaaS). Per-expense state, reviewed by the owner; not tax advice.
--
-- use_tax values:
--   na       - not applicable (default; non-taxable category)
--   review   - possibly taxable (SaaS/hosting), owner must confirm
--   owed     - confirmed: vendor did not charge Utah tax, use tax is owed
--   exempt   - confirmed not owed (not taxable, or vendor already charged tax)
--
-- NOTE: prod Supabase is migrated by hand and lags this folder.

ALTER TABLE finance_expenses
  ADD COLUMN IF NOT EXISTS use_tax TEXT NOT NULL DEFAULT 'na'
    CHECK (use_tax IN ('na', 'review', 'owed', 'exempt'));

ALTER TABLE finance_recurring_expenses
  ADD COLUMN IF NOT EXISTS use_tax TEXT NOT NULL DEFAULT 'na'
    CHECK (use_tax IN ('na', 'review', 'owed', 'exempt'));

-- Surface already-seeded SaaS/hosting rows for review (Utah taxes remotely
-- accessed prewritten software). The owner confirms per vendor whether tax was
-- already charged (-> exempt) or is owed.
UPDATE finance_expenses
  SET use_tax = 'review'
  WHERE category = 'software_hosting' AND use_tax = 'na';

UPDATE finance_recurring_expenses
  SET use_tax = 'review'
  WHERE category = 'software_hosting' AND use_tax = 'na';
