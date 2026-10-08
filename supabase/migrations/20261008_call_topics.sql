-- Topic chips on call bookings. Stores the stable chip keys chosen at booking
-- (see src/lib/call-topics.ts). The free-text `topic` column is unchanged and
-- still holds the "anything else" note. Apply by hand in prod; the app degrades
-- to the old free-text behavior until this column exists.
alter table call_bookings
  add column if not exists topics text[] not null default '{}';

-- Lets the admin console filter by chip cheaply (topics @> array['foyer']).
create index if not exists call_bookings_topics_gin on call_bookings using gin (topics);
