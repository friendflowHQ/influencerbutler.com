-- One-time cleanup of the onboarding-drip retry-loop noise.
--
-- A reserved test address (drip-test@example.com) sat in the download-app
-- onboarding pool. Reserved test domains can never receive mail, so Resend
-- rejected every send; the cron stamps a tier sent_at only on success, so the
-- lead was re-picked every 5 minutes and logged thousands of junk 'failed'
-- rows (onboarding_day2/5/10). The loop stopped once the failure-count guard
-- (20260825_onboarding_send_failures.sql) took effect in prod, but the junk
-- rows remain and inflate the dashboard's onboarding failure stats.
--
-- Going forward, isUndeliverableTestEmail (src/lib/email-address.ts) keeps such
-- addresses out of the intake and enroll paths and parks any that slip in, so
-- this is a one-time backfill, not a recurring job.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Run the two
-- statements below in the Supabase SQL editor. Both are conservatively scoped:
-- the UPDATE only parks reserved-test-domain leads that are not already
-- abandoned, and the DELETE only removes FAILED onboarding rows to reserved
-- test domains, so no real send record is touched. Run the SELECT preview in
-- the PR/chat notes first if you want to eyeball the counts.

-- 1. Park any reserved-test-domain lead so the onboarding cron stops picking it.
UPDATE email_subscribers
SET onboarding_abandoned_at = COALESCE(onboarding_abandoned_at, now())
WHERE source = 'download-app'
  AND onboarding_abandoned_at IS NULL
  AND (
    lower(split_part(email, '@', 2)) IN ('example.com', 'example.net', 'example.org')
    OR lower(split_part(email, '@', 2)) LIKE '%.test'
    OR lower(split_part(email, '@', 2)) LIKE '%.invalid'
    OR lower(split_part(email, '@', 2)) LIKE '%.example'
    OR lower(split_part(email, '@', 2)) = 'localhost'
  );

-- 2. Purge the junk failed send-log rows so onboarding failure stats read true.
DELETE FROM email_sends
WHERE status = 'failed'
  AND funnel = 'onboarding'
  AND (
    lower(split_part(recipient, '@', 2)) IN ('example.com', 'example.net', 'example.org')
    OR lower(split_part(recipient, '@', 2)) LIKE '%.test'
    OR lower(split_part(recipient, '@', 2)) LIKE '%.invalid'
    OR lower(split_part(recipient, '@', 2)) LIKE '%.example'
    OR lower(split_part(recipient, '@', 2)) = 'localhost'
  );
