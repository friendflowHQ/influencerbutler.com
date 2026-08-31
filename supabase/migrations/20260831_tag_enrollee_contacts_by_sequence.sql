-- Backfill: tag enrollee contacts by which sequence enrolled them.
--
-- The enroll -> contacts sync now stamps a per-sequence tag (e.g.
-- "seq-instagram-posse-community") so the Contacts tab shows which sequence an
-- address came from and can filter by it. This one-time pass adds that tag to
-- everyone enrolled before the change, for every sequence they are in. The slug
-- reproduces sequenceContactTag() in src/lib/email-marketing.ts exactly: lower,
-- non-alphanumeric runs -> "-", trimmed, capped at 32, "seq-" prefixed. Unions
-- onto existing tags (never replaces) and is safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql and the enrollee
-- contact backfill (20260831_backfill_enrollee_contacts.sql).

WITH enroll_tags AS (
  SELECT DISTINCT
    lower(trim(e.email)) AS email,
    CASE
      WHEN rtrim(left(btrim(regexp_replace(lower(q.name), '[^a-z0-9]+', '-', 'g'), '-'), 32), '-') = ''
        THEN 'seq-drip'
      ELSE 'seq-' || rtrim(left(btrim(regexp_replace(lower(q.name), '[^a-z0-9]+', '-', 'g'), '-'), 32), '-')
    END AS tag
  FROM email_sequence_enrollments e
  JOIN email_sequences q ON q.id = e.sequence_id
  WHERE e.email IS NOT NULL AND btrim(e.email) <> ''
)
UPDATE email_subscribers s
SET tags = (
  SELECT array_agg(DISTINCT t)
  FROM (
    SELECT unnest(coalesce(s.tags, '{}'::text[])) AS t
    UNION
    SELECT tag FROM enroll_tags et WHERE et.email = s.email
  ) u
)
WHERE EXISTS (SELECT 1 FROM enroll_tags et WHERE et.email = s.email);
