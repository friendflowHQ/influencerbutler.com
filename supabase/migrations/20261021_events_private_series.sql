-- Events: private (unlisted) events, and "pick one of several times" options
-- for a single logical event.
--
--   is_private : when true, excluded from listUpcomingEvents() - so it never
--                shows on the public /events marketing page or the signed-in
--                /dashboard/events list for any account. The direct share page
--                (/events/<id>) still works (unguessable UUID, no auth needed
--                to view); only discovery via the two listings is hidden.
--                Banners are not separately gated here: the admin create/update
--                routes refuse to set banner_enabled=true while is_private is
--                true, so a private event can never reach the cross-app banner
--                feed either.
--   series_id  : links sibling rows that are alternate time options of one
--                logical event (the admin picked "add another time" when
--                scheduling). NULL for a normal single-date event. Each sibling
--                is still a full events row with its own registrations, Meet
--                link, and recording - "pick one" means one registration per
--                person against whichever specific occurrence they chose, not
--                one registration covering every date.
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Safe to re-run (IF NOT EXISTS).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS series_id  UUID;

CREATE INDEX IF NOT EXISTS idx_events_series_id ON events(series_id) WHERE series_id IS NOT NULL;
