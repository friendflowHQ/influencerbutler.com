-- Hand-picked call times per weekday (call_availability_rules.fixed_slots).
--
-- When a rule has fixed_slots, that weekday offers ONLY those start times
-- (each must still fit inside start_min..end_min and be free), no decoy blocks
-- are placed, and an entry's optional "types" limits which call types can book
-- it ("demo" = Setup call, "support" = Priority 1:1). NULL keeps the normal
-- 30-minute grid with decoys.
--
-- Prod Supabase is applied BY HAND: paste into the Supabase SQL editor. The
-- code reads rules without this column if it is missing, so order is flexible.

ALTER TABLE call_availability_rules ADD COLUMN IF NOT EXISTS fixed_slots JSONB;

-- Monday (Mountain): 10:30 Setup or Priority, 12:00 Setup or Priority,
-- 2:00pm Priority only. Window runs to 3:00pm so the 2:00pm hour fits.
UPDATE call_availability_rules
SET start_min = 630, end_min = 900,
    fixed_slots = '[{"start_min":630},{"start_min":720},{"start_min":840,"types":["support"]}]'::jsonb
WHERE weekday = 1 AND timezone = 'America/Denver' AND effective_to IS NULL;

-- Friday (Mountain): 10:30 and 11:30 only, every call done by 12:45 for the
-- 1:00pm school pickup.
UPDATE call_availability_rules
SET start_min = 630, end_min = 780,
    fixed_slots = '[{"start_min":630},{"start_min":690}]'::jsonb
WHERE weekday = 5 AND timezone = 'America/Denver' AND effective_to IS NULL;
