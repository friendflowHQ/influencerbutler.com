-- Editable built-in funnels: per-step overrides for the 5 hardcoded email
-- funnels (trial, pro, conversion, onboarding, winback). The code copy stays
-- the DEFAULT; a row here overrides one step's subject/body/tag/timing. An
-- empty table = byte-for-byte current behavior, so the emails that drive live
-- conversions cannot break. Read + rendered by src/lib/funnel-copy.ts; edited
-- from the admin Emails > Sequences tab.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor. Safe to re-run; the code tolerates the table being
-- absent (sends fall back to code copy, editing shows a migration banner).

CREATE TABLE IF NOT EXISTS email_funnel_overrides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel     TEXT NOT NULL,           -- trial | pro | conversion | onboarding | winback
  tier       TEXT NOT NULL,           -- day0.. | 1h|3d|5d | comp_t1..discount_t3 (winback = segment_tier)
  subject    TEXT,                    -- override template; NULL/'' = use code default
  body       TEXT,                    -- override template; NULL/'' = use code default
  apply_tag  TEXT,                    -- tag to add to recipients on send (NULL = none)
  day_offset INT,                     -- timing override in days (NULL = use code default)
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funnel, tier)
);

-- Service-role only, same as the other email tables.
ALTER TABLE email_funnel_overrides ENABLE ROW LEVEL SECURITY;
