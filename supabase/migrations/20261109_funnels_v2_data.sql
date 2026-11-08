-- Funnels v2, part 1: data plumbing (2026-11-09).
--
-- Purpose: lets the built-in lifecycle funnels tailor copy by plan level and
-- desktop walkthrough answers, measure activation, and run the new
-- Beginner-to-Power "upgrade" funnel without new per-tier *_sent_at columns.
--
-- Adds:
--   email_subscribers
--     onboarding_profile        jsonb   sanitized walkthrough answers (src/lib/funnel-types.ts OnboardingProfile)
--     onboarding_profile_stage  text    capture | complete | backfill
--     onboarding_profile_at     timestamptz
--     plan_level                text    beginner | power | legacy
--     plan_level_source         text    ls | comp | intent | inferred (higher rank wins)
--     activated_at              timestamptz  first STRONG activation signal
--     activation_signal         text    which signal set activated_at
--     engaged_at                timestamptz  first WEAK signal (extension install, license validate)
--   funnel_milestones          one row per (email, milestone) signal ever seen
--   email_funnel_assignments   sticky base track + modules per (email, funnel); exits live here,
--                              never as fake *_converted_at stamps
--   email_funnel_step_sends    per-step progress for funnels with no *_sent_at columns (upgrade)
--   index email_sends (recipient, created_at) for the 44h cadence-cap lookback
--
-- What degrades if this is NOT applied (all code catches 42703 / 42P01 /
-- PGRST204 / PGRST205 and falls back):
--   - walkthrough answers are dropped at intake (email-only behavior, as today);
--   - plan_level / activation stamps are skipped; activation % shows "needs migration";
--   - assignments are computed in memory as track "unknown" with no modules (base copy);
--   - the upgrade funnel sends nothing (no progress table to dedupe against);
--   - the cadence cap still works, just without the index.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- email_subscribers: profile, plan level, activation
-- ---------------------------------------------------------------------------
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS onboarding_profile JSONB;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS onboarding_profile_stage TEXT;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS onboarding_profile_at TIMESTAMPTZ;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS plan_level TEXT;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS plan_level_source TEXT;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS activation_signal TEXT;
ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS engaged_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscribers_onboarding_profile_stage_check') THEN
    ALTER TABLE email_subscribers
      ADD CONSTRAINT email_subscribers_onboarding_profile_stage_check
      CHECK (onboarding_profile_stage IS NULL OR onboarding_profile_stage IN ('capture', 'complete', 'backfill'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscribers_plan_level_check') THEN
    ALTER TABLE email_subscribers
      ADD CONSTRAINT email_subscribers_plan_level_check
      CHECK (plan_level IS NULL OR plan_level IN ('beginner', 'power', 'legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscribers_plan_level_source_check') THEN
    ALTER TABLE email_subscribers
      ADD CONSTRAINT email_subscribers_plan_level_source_check
      CHECK (plan_level_source IS NULL OR plan_level_source IN ('ls', 'comp', 'intent', 'inferred'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_subscribers_activated_at_idx
  ON email_subscribers (activated_at) WHERE activated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_subscribers_plan_level_idx
  ON email_subscribers (plan_level) WHERE plan_level IS NOT NULL;

-- ---------------------------------------------------------------------------
-- funnel_milestones: every activation / engagement signal, once per email
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funnel_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,                 -- lowercased + trimmed
  milestone   TEXT NOT NULL,                 -- ActivationSignal (funnel-types.ts)
  source      TEXT,                          -- e.g. 'intake', 'desktop-actions', 'earnings-sync'
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, milestone)
);
CREATE INDEX IF NOT EXISTS funnel_milestones_occurred_idx ON funnel_milestones (occurred_at DESC);
ALTER TABLE funnel_milestones ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- email_funnel_assignments: sticky track + modules per person per funnel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_funnel_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,                 -- lowercased + trimmed
  funnel      TEXT NOT NULL,                 -- trial | pro | onboarding | apptrial | winback | conversion | upgrade
  track       TEXT NOT NULL DEFAULT 'unknown'
              CHECK (track IN ('beginner', 'power', 'unknown', 'starter')),
  modules     TEXT[] NOT NULL DEFAULT '{}',  -- ranked ModuleKey list, at most 3
  locked_at   TIMESTAMPTZ,                   -- set when the first module slot sends; track/modules frozen after
  exited_at   TIMESTAMPTZ,
  exit_reason TEXT,                          -- superseded | converted | unsubscribed | plan-changed | manual
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, funnel)
);
CREATE INDEX IF NOT EXISTS email_funnel_assignments_funnel_idx
  ON email_funnel_assignments (funnel, track);
ALTER TABLE email_funnel_assignments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- email_funnel_step_sends: progress for funnels without *_sent_at columns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_funnel_step_sends (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email    TEXT NOT NULL,                    -- lowercased + trimmed
  funnel   TEXT NOT NULL,                    -- 'upgrade' in v1
  tier     TEXT NOT NULL,                    -- bare tier, e.g. 'u1'
  step_key TEXT,                             -- content key actually sent, e.g. 'u1.power'
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, funnel, tier)
);
CREATE INDEX IF NOT EXISTS email_funnel_step_sends_funnel_idx
  ON email_funnel_step_sends (funnel, tier, sent_at DESC);
ALTER TABLE email_funnel_step_sends ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- email_sends: cadence-cap lookback (column is `recipient`, see 20260816)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS email_sends_recipient_created_idx
  ON email_sends (recipient, created_at DESC);
