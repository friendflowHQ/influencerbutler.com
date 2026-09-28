-- Social community snapshots: a daily point-in-time member count per platform.
--
-- Powers the "Facebook group members" growth metric. Unlike the event-stream
-- metrics (trial clicks, signups) this records a LEVEL, not a flow: one row per
-- platform per day holds that day's member headcount. A daily scheduled task
-- reads the count from the Facebook group and POSTs it to
-- /api/admin/growth/social-snapshot, which upserts on (platform, captured_on)
-- so re-running a day corrects the number instead of duplicating it.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the Facebook members tile reads n/a.
--
-- Service-role only (RLS enabled, zero policies), same as growth_goals and
-- email_subscribers: every read/write goes through createAdminClient() in
-- permission-gated admin routes.

CREATE TABLE IF NOT EXISTS social_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     TEXT NOT NULL DEFAULT 'facebook',
  captured_on  DATE NOT NULL,              -- 'YYYY-MM-DD' (UTC)
  member_count INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, captured_on)
);

CREATE INDEX IF NOT EXISTS social_snapshots_platform_day_idx
  ON social_snapshots (platform, captured_on);

ALTER TABLE social_snapshots ENABLE ROW LEVEL SECURITY;
