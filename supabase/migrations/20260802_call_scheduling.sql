-- Call scheduling: 1:1 support + demo call booking.
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Tables are service-role-only (deny-all RLS); all
-- customer + admin access goes through Next.js server routes using the
-- service-role client (mirrors the `subscriptions` table pattern).

-- ─────────────────────────────────────────────────────────────────────────
-- Bookings
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email     TEXT NOT NULL,
  user_name      TEXT,
  call_type      TEXT NOT NULL CHECK (call_type IN ('support','demo')),
  starts_at      TIMESTAMPTZ NOT NULL,            -- block start (UTC)
  ends_at        TIMESTAMPTZ NOT NULL,            -- backend BLOCK end (incl. buffer)
  user_ends_at   TIMESTAMPTZ NOT NULL,            -- customer-facing end
  user_timezone  TEXT,                            -- IANA zone the customer booked in
  status         TEXT NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  topic          TEXT,
  join_url       TEXT,
  meeting_provider TEXT,                          -- 'zoom' | 'manual' | NULL
  meeting_id     TEXT,
  host_notes     TEXT,
  reminded_24h_at TIMESTAMPTZ,
  reminded_1h_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at   TIMESTAMPTZ,
  cancel_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_call_bookings_starts   ON call_bookings(starts_at);
CREATE INDEX IF NOT EXISTS idx_call_bookings_status   ON call_bookings(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_call_bookings_user     ON call_bookings(user_id);

ALTER TABLE call_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_bookings_no_anon ON call_bookings;
CREATE POLICY call_bookings_no_anon ON call_bookings FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- Owner availability windows (weekly, per IANA zone, with effective ranges
-- so the Eastern -> Mountain move on ~2026-08-16 is a data change, not code)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_availability_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday        INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun..6=Sat
  start_min      INT NOT NULL,                                  -- minutes from local midnight
  end_min        INT NOT NULL,
  timezone       TEXT NOT NULL,                                 -- IANA, e.g. America/New_York
  effective_from DATE,                                          -- inclusive; NULL = always
  effective_to   DATE,                                          -- exclusive; NULL = open ended
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_rules_weekday ON call_availability_rules(weekday);

ALTER TABLE call_availability_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_rules_no_anon ON call_availability_rules;
CREATE POLICY call_rules_no_anon ON call_availability_rules FOR ALL USING (false) WITH CHECK (false);

-- Seed: Mon-Fri, Eastern through 2026-08-16 (10:00-17:00), then Denver
-- (Mountain) 10:00-14:00 so every call ends by 2:00pm, leaving a buffer before
-- the 2:15pm school pickup. Decoys are engine-computed, not seeded here.
INSERT INTO call_availability_rules (weekday, start_min, end_min, timezone, effective_from, effective_to)
SELECT wd, 600, 1020, 'America/New_York', NULL, DATE '2026-08-16'
FROM generate_series(1,5) AS wd
WHERE NOT EXISTS (SELECT 1 FROM call_availability_rules WHERE timezone='America/New_York' AND weekday=wd);

INSERT INTO call_availability_rules (weekday, start_min, end_min, timezone, effective_from, effective_to)
SELECT wd, 600, 840, 'America/Denver', DATE '2026-08-16', NULL
FROM generate_series(1,5) AS wd
WHERE NOT EXISTS (SELECT 1 FROM call_availability_rules WHERE timezone='America/Denver' AND weekday=wd);

-- ─────────────────────────────────────────────────────────────────────────
-- Owner manual holds (the fixed 3-5pm block + random decoys are engine-computed)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_blocks_starts ON call_blocks(starts_at);

ALTER TABLE call_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_blocks_no_anon ON call_blocks;
CREATE POLICY call_blocks_no_anon ON call_blocks FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- Single-row config
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_config (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  booking_horizon_days INT NOT NULL DEFAULT 14,
  lead_time_hours     INT NOT NULL DEFAULT 12,
  decoy_min_per_day   INT NOT NULL DEFAULT 2,
  decoy_max_per_day   INT NOT NULL DEFAULT 4,
  default_join_url    TEXT,
  google_refresh_token TEXT,          -- owner's Google OAuth refresh token (Meet)
  google_calendar_email TEXT,         -- the connected Google account
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent adds so re-running (or an earlier run without these columns) is safe.
ALTER TABLE call_config ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE call_config ADD COLUMN IF NOT EXISTS google_calendar_email TEXT;
INSERT INTO call_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE call_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_config_no_anon ON call_config;
CREATE POLICY call_config_no_anon ON call_config FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- Atomic booking: reject overlaps with confirmed bookings or manual blocks,
-- then insert. SECURITY DEFINER so it runs with table owner rights; callers
-- are already the service-role server routes. Returns the new row id.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION book_call(
  p_user_id      UUID,
  p_user_email   TEXT,
  p_user_name    TEXT,
  p_call_type    TEXT,
  p_starts_at    TIMESTAMPTZ,
  p_ends_at      TIMESTAMPTZ,
  p_user_ends_at TIMESTAMPTZ,
  p_user_timezone TEXT,
  p_topic        TEXT,
  p_join_url     TEXT,
  p_meeting_provider TEXT,
  p_meeting_id   TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Overlap with another confirmed booking's blocked range?
  IF EXISTS (
    SELECT 1 FROM call_bookings
    WHERE status = 'confirmed'
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;
  -- Overlap with an owner manual block?
  IF EXISTS (
    SELECT 1 FROM call_blocks
    WHERE tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  INSERT INTO call_bookings (
    user_id, user_email, user_name, call_type, starts_at, ends_at, user_ends_at,
    user_timezone, topic, join_url, meeting_provider, meeting_id
  ) VALUES (
    p_user_id, p_user_email, p_user_name, p_call_type, p_starts_at, p_ends_at, p_user_ends_at,
    p_user_timezone, p_topic, p_join_url, p_meeting_provider, p_meeting_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Call recording + AI transcript/notes (Project 6). A Recall.ai meeting bot
-- records each Google Meet; a webhook fills the transcript + AI notes so the
-- call can be reviewed later. These columns are populated POST-call, never at
-- booking time, so book_call() above is unchanged. Idempotent adds mirror the
-- call_config pattern. recording_status:
--   none | skipped_no_meet | scheduled | recording | processing | ready | failed
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS recall_bot_id    TEXT;
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS recording_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS recording_url    TEXT;
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS transcript       TEXT;
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS ai_notes         JSONB;
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS recorded_at      TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_call_bookings_recall_bot ON call_bookings(recall_bot_id);
CREATE INDEX IF NOT EXISTS idx_call_bookings_rec_status ON call_bookings(recording_status, ends_at);
