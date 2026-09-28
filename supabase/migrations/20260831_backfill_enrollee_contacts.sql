-- Backfill: sequence enrollees become contacts.
--
-- Historically, pasting emails into a sequence's Enroll box wrote only
-- email_sequence_enrollments, so those people never appeared on the Contacts
-- tab (which reads email_subscribers). The enroll API now mirrors new enrollees
-- into contacts going forward; this one-time backfill covers everyone enrolled
-- before that fix. ON CONFLICT keeps existing contacts (and their source/tags)
-- untouched. Safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql.

INSERT INTO email_subscribers (email, source)
SELECT DISTINCT lower(trim(email)) AS email, 'sequence-enroll' AS source
FROM email_sequence_enrollments
WHERE email IS NOT NULL AND trim(email) <> ''
ON CONFLICT (email) DO NOTHING;
