-- Events: scheduled group calls (webinar-style) with RSVP, cross-app banner
-- notices, day-before reminders, and an AI recap emailed after the recorded
-- call. Distinct from the 1:1 call_bookings system, but reuses its building
-- blocks (Google Meet auto-create, Recall.ai recording, the AI-notes pipeline).
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Tables are service-role-only (deny-all RLS); all
-- customer + admin access goes through Next.js server routes using the
-- service-role client (mirrors the call_bookings / subscriptions pattern).

-- ─────────────────────────────────────────────────────────────────────────
-- Events
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,             -- UTC
  ends_at          TIMESTAMPTZ NOT NULL,             -- UTC
  timezone         TEXT NOT NULL DEFAULT 'America/Denver',  -- display TZ
  status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('draft','scheduled','cancelled','completed')),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at     TIMESTAMPTZ,

  -- Meeting (auto-created Google Meet, or a manual link)
  join_url         TEXT,
  meeting_provider TEXT,                              -- 'google_meet' | 'manual' | NULL
  meeting_id       TEXT,                              -- Google Calendar event id, for later delete

  -- Banner control (one event drives the cross-app banner). "When it shows" is
  -- the banner window; "which apps" is banner_surfaces; "what text" is the copy.
  banner_enabled   BOOLEAN NOT NULL DEFAULT false,
  banner_text      TEXT,
  banner_cta_label TEXT,                              -- e.g. 'Register'
  banner_starts_at TIMESTAMPTZ,
  banner_ends_at   TIMESTAMPTZ,
  banner_surfaces  TEXT[] NOT NULL DEFAULT '{web,extension,desktop}',

  -- Recording + recap (mirrors the call_bookings recording columns)
  record_enabled   BOOLEAN NOT NULL DEFAULT true,
  recall_bot_id    TEXT,
  recording_status TEXT NOT NULL DEFAULT 'none',      -- none|skipped_no_meet|scheduled|recording|processing|ready|failed
  recording_url    TEXT,
  transcript       TEXT,
  ai_notes         JSONB,
  recorded_at      TIMESTAMPTZ,
  highlights_emailed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_events_starts     ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_banner     ON events(banner_enabled, banner_starts_at, banner_ends_at);
CREATE INDEX IF NOT EXISTS idx_events_recall_bot ON events(recall_bot_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_no_anon ON events;
CREATE POLICY events_no_anon ON events FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- Registrations (RSVP list). One row per email per event.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  user_timezone   TEXT,                               -- IANA zone the user registered in
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminded_24h_at TIMESTAMPTZ,
  reminded_1h_at  TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  UNIQUE (event_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_event_regs_event  ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_regs_remind ON event_registrations(reminded_24h_at);
CREATE INDEX IF NOT EXISTS idx_event_regs_user   ON event_registrations(user_id);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_regs_no_anon ON event_registrations;
CREATE POLICY event_regs_no_anon ON event_registrations FOR ALL USING (false) WITH CHECK (false);
