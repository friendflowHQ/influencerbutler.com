-- Funnels v2, part 2: measurement, A/B tests and freshness stamps (2026-11-10).
--
-- Purpose: built-in funnel A/B tests that auto-promote a winner, per-send
-- variant logging, real paid-conversion stamps for win-back and affiliate
-- conversion, and "last updated / reviewed" stamps for funnels and sequences.
--
-- Adds:
--   email_experiments          one A/B test (a built-in funnel step, or a sequence -a/-b group)
--   email_experiment_arms      the arms of a test ('a' = control, 'b' = challenger)
--   email_sends                experiment_id, variant ('a'|'b'), step_key (content key sent, e.g. 'day5.beginner')
--   email_sequences            updated_at, updated_by, content_updated_at, content_updated_by
--   email_sequence_steps       updated_at, updated_by
--   email_sequence_enrollments converted_kind ('trial' | 'paid')
--   email_funnel_overrides     reviewed_at, reviewed_by ("Mark reviewed")
--   subscription_cancel_reasons winback_converted_at, winback_conversion_kind (comp | discount | organic)
--   affiliate_applications     conversion_purchased_at
--
-- What degrades if this is NOT applied (code catches 42703 / 42P01 /
-- PGRST204 / PGRST205 and falls back):
--   - no experiments run; every send uses the resolved copy (arm 'a' behavior);
--   - send logging retries without experiment_id / variant / step_key, so rows are never lost;
--   - sequence and override "last updated" fall back to created_at / override updated_at;
--     "Mark reviewed" returns migrationPending;
--   - win-back paid % and affiliate conversion paid % show "needs migration".
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20261109_funnels_v2_data.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- email_experiments
-- ---------------------------------------------------------------------------
-- kind 'funnel_step': funnel + tier + content_key name the step. segment NULL
--   means everyone who reaches that tier (content_key = the bare tier);
--   otherwise segment is the content-key suffix (e.g. 'beginner', 'mod-walmart')
--   and content_key = tier || '.' || segment. promoteWinner writes to
--   content_key and refuses a NULL segment when tailored code copy exists.
-- kind 'sequence_group': base_tag names the sequence -a/-b sibling group;
--   arms carry sequence_id; the loser is paused.
-- Outcome detail lives in `decision` (jsonb: {outcome: 'promote'|'inconclusive'
--   |'conflict', metric, z, p, alpha, look, rates, sends}); an inconclusive or
--   conflicting test is status 'decided' with winner_arm NULL.
CREATE TABLE IF NOT EXISTS email_experiments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   TEXT NOT NULL DEFAULT 'funnel_step'
                         CHECK (kind IN ('funnel_step', 'sequence_group')),
  name                   TEXT NOT NULL DEFAULT '',
  funnel                 TEXT,                    -- funnel_step: trial | pro | ... | upgrade
  tier                   TEXT,                    -- funnel_step: bare tier, e.g. 'day3'
  content_key            TEXT,                    -- funnel_step: key the test runs on / promotes to
  segment                TEXT,                    -- NULL = all tracks at this tier
  base_tag               TEXT,                    -- sequence_group: e.g. 'cold-ig-amazon'
  primary_metric         TEXT NOT NULL DEFAULT 'click'
                         CHECK (primary_metric IN ('click', 'paid', 'activation')),
  guardrail_metric       TEXT
                         CHECK (guardrail_metric IS NULL OR guardrail_metric IN ('click', 'paid', 'activation')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'running', 'decided', 'stopped')),
  min_sends_per_arm      INT NOT NULL DEFAULT 200,
  max_days               INT NOT NULL DEFAULT 45,
  conversion_window_days INT NOT NULL DEFAULT 14,
  looks_done             INT NOT NULL DEFAULT 0,  -- sequential looks taken (max 4, Pocock alpha 0.0182)
  last_look_at           TIMESTAMPTZ,
  started_at             TIMESTAMPTZ,
  ended_at               TIMESTAMPTZ,
  decided_at             TIMESTAMPTZ,
  winner_arm             TEXT CHECK (winner_arm IS NULL OR winner_arm IN ('a', 'b')),
  decision               JSONB,
  created_by             TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             TEXT NOT NULL DEFAULT '',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one running test per step + segment, and per sequence group.
CREATE UNIQUE INDEX IF NOT EXISTS email_experiments_one_running_step
  ON email_experiments (funnel, tier, coalesce(segment, ''))
  WHERE status = 'running' AND kind = 'funnel_step';
CREATE UNIQUE INDEX IF NOT EXISTS email_experiments_one_running_group
  ON email_experiments (base_tag)
  WHERE status = 'running' AND kind = 'sequence_group';
CREATE INDEX IF NOT EXISTS email_experiments_status_idx ON email_experiments (status, started_at);
ALTER TABLE email_experiments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- email_experiment_arms
-- ---------------------------------------------------------------------------
-- Arm 'a' with NULL subject/body = the copy the send path resolves today
-- (control). Arm 'b' holds the challenger template ({{vars}} allowed).
CREATE TABLE IF NOT EXISTS email_experiment_arms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES email_experiments(id) ON DELETE CASCADE,
  arm           TEXT NOT NULL CHECK (arm IN ('a', 'b')),
  subject       TEXT,
  body          TEXT,
  sequence_id   UUID,                           -- sequence_group arms only
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, arm)
);
ALTER TABLE email_experiment_arms ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- email_sends: which arm and content key each send used
-- ---------------------------------------------------------------------------
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS experiment_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS step_key TEXT;
CREATE INDEX IF NOT EXISTS email_sends_experiment_idx
  ON email_sends (experiment_id, variant) WHERE experiment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sequence freshness stamps
-- ---------------------------------------------------------------------------
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS content_updated_at TIMESTAMPTZ;
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS content_updated_by TEXT;
UPDATE email_sequences SET content_updated_at = created_at WHERE content_updated_at IS NULL;
UPDATE email_sequences SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE email_sequence_enrollments ADD COLUMN IF NOT EXISTS converted_kind TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_sequence_enrollments_converted_kind_check') THEN
    ALTER TABLE email_sequence_enrollments
      ADD CONSTRAINT email_sequence_enrollments_converted_kind_check
      CHECK (converted_kind IS NULL OR converted_kind IN ('trial', 'paid'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Built-in funnel overrides: "Mark reviewed"
-- ---------------------------------------------------------------------------
ALTER TABLE email_funnel_overrides ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE email_funnel_overrides ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- ---------------------------------------------------------------------------
-- Real paid-conversion stamps
-- ---------------------------------------------------------------------------
ALTER TABLE subscription_cancel_reasons ADD COLUMN IF NOT EXISTS winback_converted_at TIMESTAMPTZ;
ALTER TABLE subscription_cancel_reasons ADD COLUMN IF NOT EXISTS winback_conversion_kind TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_cancel_reasons_winback_conversion_kind_check') THEN
    ALTER TABLE subscription_cancel_reasons
      ADD CONSTRAINT subscription_cancel_reasons_winback_conversion_kind_check
      CHECK (winback_conversion_kind IS NULL OR winback_conversion_kind IN ('comp', 'discount', 'organic'));
  END IF;
END $$;

ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS conversion_purchased_at TIMESTAMPTZ;
