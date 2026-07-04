-- Growth dashboard: monthly goals + growth checklist.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, /api/admin/growth/goals and .../checklist
-- return migrationPending: true and the dashboard shows a setup note.
--
-- Both tables are service-role only (RLS enabled, zero policies), same as
-- email_subscribers: every read/write goes through createAdminClient() in
-- permission-gated admin routes.

CREATE TABLE IF NOT EXISTS growth_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month         TEXT NOT NULL,            -- 'YYYY-MM' (UTC)
  metric        TEXT NOT NULL,            -- key from the GROWTH_METRICS catalog
  target        NUMERIC NOT NULL,
  baseline      NUMERIC,                  -- last month's actual at suggestion time
  status        TEXT NOT NULL DEFAULT 'suggested'
                CHECK (status IN ('suggested','accepted','dismissed')),
  achieved_at   TIMESTAMPTZ,
  celebrated_at TIMESTAMPTZ,              -- confetti fired once; never re-fire
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, metric)
);

ALTER TABLE growth_goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS growth_checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month       TEXT NOT NULL,              -- 'YYYY-MM' (UTC)
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'content'
              CHECK (category IN ('content','affiliates','conversion','retention','community')),
  source      TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library','custom')),
  library_key TEXT,                       -- stable idea id, dedupes reseeding
  sort        INT NOT NULL DEFAULT 0,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_checklist_month_idx
  ON growth_checklist_items (month, sort);

ALTER TABLE growth_checklist_items ENABLE ROW LEVEL SECURITY;
