-- Private 1:1 "event follow-up" calls: a handful of 45-minute slots opened for
-- a specific event, bookable only by that event's registrants (never through
-- the public /dashboard/book page). A slot is held the instant it's offered
-- (open, unclaimed) all the way through to being a real confirmed call - see
-- loadBusy() in src/lib/scheduling-server.ts, which treats both an 'open'
-- offer and a confirmed event_followup call_bookings row as busy with a
-- 30-minute pad on both sides, so nothing new (another call, or the public
-- booking page) can land within half an hour of it, before or after claim.
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Safe to re-run (IF NOT EXISTS / IF EXISTS).

ALTER TABLE call_bookings DROP CONSTRAINT IF EXISTS call_bookings_call_type_check;
ALTER TABLE call_bookings ADD CONSTRAINT call_bookings_call_type_check
  CHECK (call_type IN ('support','demo','event_followup'));

CREATE TABLE IF NOT EXISTS event_call_offers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  starts_at          TIMESTAMPTZ NOT NULL,   -- real 45-min customer-facing start, unpadded
  ends_at            TIMESTAMPTZ NOT NULL,   -- real 45-min customer-facing end, unpadded
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','cancelled')),
  claimed_booking_id UUID REFERENCES call_bookings(id) ON DELETE SET NULL,
  claimed_email      TEXT,
  claimed_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_call_offers_event  ON event_call_offers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_call_offers_status ON event_call_offers(status, ends_at);

ALTER TABLE event_call_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_call_offers_no_anon ON event_call_offers;
CREATE POLICY event_call_offers_no_anon ON event_call_offers FOR ALL USING (false) WITH CHECK (false);
