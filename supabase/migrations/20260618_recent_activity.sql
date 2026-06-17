-- Recent-activity social-proof widget.
--
-- Three tables feed a small "someone just started a trial / subscribed" popup
-- on the marketing site:
--
--   activity_events : the unified public feed. Both the trial-click route and
--                     the order_created webhook write rows here. The widget
--                     reads non-hidden, non-bot rows within a configurable
--                     window. Admins can hide individual rows.
--   checkout_geo    : bridges the visitor's Vercel geo (captured at checkout
--                     time, keyed by welcome_token) to the order_created webhook,
--                     which is a server-to-server call from Lemon Squeezy and so
--                     has no visitor geo of its own.
--   app_config      : generic key/value settings store (none existed before).
--                     Seeds the widget's window / count / enabled config.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that writes these tables.
-- The writing code is best-effort (never throws) so a missing table only means
-- the widget stays empty, but the rows won't be captured until this is applied.

CREATE TABLE IF NOT EXISTS activity_events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('trial_click', 'purchase')),
  first_name  TEXT,
  city        TEXT,
  region      TEXT,
  country     TEXT,
  plan_label  TEXT,
  source      TEXT,
  is_bot      BOOLEAN NOT NULL DEFAULT false,
  hidden      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The widget query: newest-first over the rows that can actually show.
CREATE INDEX IF NOT EXISTS activity_events_public_idx
  ON activity_events (created_at DESC)
  WHERE hidden = false AND is_bot = false;

CREATE TABLE IF NOT EXISTS checkout_geo (
  welcome_token  TEXT PRIMARY KEY,
  city           TEXT,
  region         TEXT,
  country        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Default config for the recent-activity widget. ON CONFLICT keeps any value an
-- admin has already set if this migration is re-run.
INSERT INTO app_config (key, value)
VALUES (
  'activity_widget',
  '{"enabled": true, "window_minutes": 1440, "max_count": 5}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Lock all three down: only the service-role key (used by our server routes)
-- may read or write. Anon / authenticated browser clients get nothing; the
-- public widget reads through a service-role server route that returns only
-- non-identifying fields.
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_geo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config      ENABLE ROW LEVEL SECURITY;
