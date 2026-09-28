-- Fix: give the cold Amazon A/B/C variant sequences non-colliding ids so their
-- per-step open/click stats are separable.
--
-- BUG: email_sends stats are keyed by stepCategory() = seq_<shortId>_s<pos>, and
-- shortId(id) = id.replace(/-/g,"").slice(0,8) (src/lib/email-marketing.ts). The
-- variant ids seeded by 20260904_cold_tiktok_amazon_abc_test.sql /
-- 20260904_cold_ig_amazon_abc_test.sql differ only in their LAST char
-- (1a5e0004-...-000a/b/c and 1a5e0003-...-000a/b/c), so every TikTok variant AND
-- the original cold-tiktok-amazon collapse to shortId "1a5e0004" (Instagram to
-- "1a5e0003"). Result: all four TikTok sequences share category seq_1a5e0004_s1,
-- so the dashboard shows one pooled "sent / open% / click%" for all of them and
-- the A/B/C opener test cannot be read on opens/clicks. (Conversions are keyed by
-- sequence_id on the enrollment, so those were always per-variant and correct.)
--
-- FIX: re-id the six variants so their first 8 hex chars are distinct from each
-- other and from the originals (1a5e0004 / 1a5e0003):
--   TikTok  A 1a5e0004-...-000a -> 1a5e04a1-...-004a  (shortId 1a5e04a1)
--           B 1a5e0004-...-000b -> 1a5e04b1-...-004b  (shortId 1a5e04b1)
--           C 1a5e0004-...-000c -> 1a5e04c1-...-004c  (shortId 1a5e04c1)
--   Instagram A 1a5e0003-...-000a -> 1a5e03a1-...-003a  (shortId 1a5e03a1)
--             B 1a5e0003-...-000b -> 1a5e03b1-...-003b  (shortId 1a5e03b1)
--             C 1a5e0003-...-000c -> 1a5e03c1-...-003c  (shortId 1a5e03c1)
--
-- Each variant: copy the sequence row to the new id, move its steps and
-- enrollments (preserving last_step_sent / converted_step progress), then drop
-- the old row. Tags, triggers, names, statuses and step copy are unchanged, so
-- auto-enroll and the split-enroll keep working. Idempotent: re-running finds no
-- old rows and does nothing. Runs after the two 20260904 seed migrations (so on a
-- fresh replay the seeds create the old ids first and this migration corrects
-- them); on prod it corrects the already-applied ids in place.
--
-- CAVEAT: emails already sent under the old shared category stay pooled in the
-- historical email_sends rows (open/click for those cannot be un-pooled). Every
-- send from now on (the still-queued Step 1s and all of Steps 2-4) lands under
-- the new distinct categories, so the bulk of the test reads cleanly per variant.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after both 20260904 abc_test migrations. Insert the new
-- sequence row BEFORE moving its children so the foreign key target exists, and
-- delete the old row only after its children have moved off it.

BEGIN;

-- === TikTok A ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e04a1-0000-4000-a000-00000000004a', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000a'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e04a1-0000-4000-a000-00000000004a'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000a';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e04a1-0000-4000-a000-00000000004a'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000a';
DELETE FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000a';

-- === TikTok B ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e04b1-0000-4000-a000-00000000004b', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000b'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e04b1-0000-4000-a000-00000000004b'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000b';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e04b1-0000-4000-a000-00000000004b'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000b';
DELETE FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000b';

-- === TikTok C ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e04c1-0000-4000-a000-00000000004c', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000c'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e04c1-0000-4000-a000-00000000004c'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000c';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e04c1-0000-4000-a000-00000000004c'
WHERE sequence_id = '1a5e0004-0000-4000-a000-00000000000c';
DELETE FROM email_sequences WHERE id = '1a5e0004-0000-4000-a000-00000000000c';

-- === Instagram A ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e03a1-0000-4000-a000-00000000003a', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000a'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e03a1-0000-4000-a000-00000000003a'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000a';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e03a1-0000-4000-a000-00000000003a'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000a';
DELETE FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000a';

-- === Instagram B ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e03b1-0000-4000-a000-00000000003b', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000b'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e03b1-0000-4000-a000-00000000003b'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000b';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e03b1-0000-4000-a000-00000000003b'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000b';
DELETE FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000b';

-- === Instagram C ===
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by, created_at)
SELECT '1a5e03c1-0000-4000-a000-00000000003c', name, status, trigger, sends_per_hour, track_opens, created_by, created_at
FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000c'
ON CONFLICT (id) DO NOTHING;
UPDATE email_sequence_steps SET sequence_id = '1a5e03c1-0000-4000-a000-00000000003c'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000c';
UPDATE email_sequence_enrollments SET sequence_id = '1a5e03c1-0000-4000-a000-00000000003c'
WHERE sequence_id = '1a5e0003-0000-4000-a000-00000000000c';
DELETE FROM email_sequences WHERE id = '1a5e0003-0000-4000-a000-00000000000c';

COMMIT;
