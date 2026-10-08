-- Build Week: eligibility / claim entries.
--
-- Members pitch Butler ideas in the Facebook group; this table is the small
-- sign-up behind the guarantee ("if we cannot build your idea to the Working
-- Standard by the deadline, you and a friend get lifetime access"). One row per
-- person per event (unique event_slug + lower(email)). The columns after
-- `consent_at` are the owner's review workflow, filled from the Supabase table
-- editor or a future admin page: who was featured and why, whether it shipped,
-- and the friend named when a guarantee prize is claimed.
--
-- RLS is ON with NO public policy: the public entry route uses the service-role
-- client (src/lib/supabase/admin.ts), the same way bundle_contributors does.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor. Idempotent (IF NOT EXISTS). The entry route degrades
-- (503 "not open yet") when the table is missing, so shipping the code first is safe.

CREATE TABLE IF NOT EXISTS build_week_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug       text NOT NULL DEFAULT 'build-week-2026-11',
  name             text NOT NULL,
  email            text NOT NULL,
  group_name       text,
  idea_url         text,
  idea_url_2       text,
  idea_summary     text,
  keep_private     boolean NOT NULL DEFAULT false,
  wants_updates    boolean NOT NULL DEFAULT false,
  -- Consent record: which Rules version and exact wording they agreed to, and when.
  rules_version    text NOT NULL,
  consent_text     text NOT NULL,
  consent_at       timestamptz NOT NULL DEFAULT now(),
  -- Owner review workflow:
  -- new -> eligible -> featured -> built | guarantee_owed -> claimed, or declined.
  status           text NOT NULL DEFAULT 'new',
  featured_source  text,        -- 'reactions' or 'staff'
  featured_rank    integer,
  reaction_count   integer,
  built_at         timestamptz,
  claimed_at       timestamptz,
  friend_name      text,
  friend_email     text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS build_week_entries_event_email_uidx
  ON build_week_entries (event_slug, lower(email));

CREATE INDEX IF NOT EXISTS build_week_entries_status_idx
  ON build_week_entries (event_slug, status);

ALTER TABLE build_week_entries ENABLE ROW LEVEL SECURITY;
