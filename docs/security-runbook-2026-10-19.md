# Security runbook: owner-only follow-ups (2026-10-19)

From the MCP server / Supabase RLS audit. Everything in this file needs live
database or dashboard access, so none of it was done automatically. Work top
to bottom.

**Incident note:** applying migration #3 below broke live affiliate
applications in production (every submission failed with "permission denied
for table affiliate_applications") because the GRANT whitelist missed two
columns the submit flow writes on every save (`user_id`, `status`). Fixed by
migration #3b, applied directly to prod as an emergency fix before this file
was updated. If you already ran #3 and are reading this fresh, make sure #3b
ran too (it is idempotent, safe to run again).

## 0. Apply the pending database migrations to prod

Prod Supabase is applied by hand (see `docs/security-runbook-2026-08.md`
section 0, which covers the first two). In the Supabase dashboard SQL editor,
run, in order, whichever of these have not already been applied:

1. `supabase/migrations/20260827_profiles_column_lockdown.sql` (critical,
   carried over from the August pass: stops users self-granting commission /
   repointing payouts). **If you are not certain this already ran, treat it
   as the top priority.**
2. `supabase/migrations/20261007_community_author_email_lockdown.sql` (high:
   stops the `author_email` column on `community_questions` /
   `community_answers` from being readable by the public anon key).
3. `supabase/migrations/20261019_affiliate_applications_column_lockdown.sql`
   (new in this pass: stops a pending affiliate applicant from editing the
   staff-only `admin_notes` column, and the funnel/activation timestamp
   columns, on their own application row).
3b. `supabase/migrations/20261019b_affiliate_applications_upsert_columns.sql`
   (emergency follow-up: #3's whitelist missed `user_id` and `status`, which
   the application-submit upsert writes on every save. Without this, the
   affiliate signup form is broken for everyone. Run this immediately after
   #3, every time.)
4. `supabase/migrations/20261019_mcp_api_keys_expiry.sql` (new in this pass:
   adds `expires_at` to `mcp_api_keys` and backfills a 1 year expiry on
   existing keys; needed for the token-expiry code fix in the
   `security-audit-fixes-2026-10-19` branch to work).

### Verify each lockdown (read-only)

Run in the Supabase SQL editor. A clean result shows only the intended
columns granted; anything else listed means that lockdown has not been
applied yet.

```sql
-- profiles: should list only display_name, username, avatar_url, avatar_updated_at
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='profiles'
  AND grantee='authenticated' AND privilege_type='UPDATE';

-- community tables: should NOT include author_email
SELECT table_name, column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name IN ('community_questions','community_answers')
  AND grantee IN ('anon','authenticated') AND privilege_type='SELECT'
  AND column_name='author_email';

-- affiliate_applications: should list exactly these 11 columns (the 9 form
-- fields plus user_id and status, added by 3b) and NOT admin_notes,
-- reviewed_at, or any of the activation_*/conversion_*/unique_discount_code_50
-- columns
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='affiliate_applications'
  AND grantee='authenticated' AND privilege_type='UPDATE';
```

After applying #3 and #3b, also confirm end to end, not just the grant list:
submit a real test application at `/affiliates/apply` (or `/dashboard/affiliates`
if already signed in) and make sure it saves without a "permission denied"
error. A clean grant list is necessary but not sufficient - it only tells
you a column is reachable, not that every write path that needs it was
accounted for (that is exactly how #3 shipped broken: the grant list looked
right, the app's actual upsert payload did not match it).

After applying #1, also confirm end to end: open `/dashboard/profile` on
www and save a display name change (should still work), then confirm a
direct PATCH of `commission_percent` on your own profile row now fails
(401/403, not 204).

## 1. Merge the code fix branch

The rate limiting, token expiry, and `last_used_at` tracking fixes for
`/api/mcp` and `/api/mcp-keys` are on branch `security-audit-fixes-2026-10-19`
(pushed, not yet a PR). Open a PR from it against `main` and review before
merging. It depends on migration #4 above being applied first (the `expires_at`
column must exist before the new code reads/writes it); deploy order is:
migration #4, then merge/deploy the branch.

## 2. Things nobody can verify from the repo

- **`subscriptions` table RLS.** Queried client-side with the anon key
  (`src/app/dashboard/billing/page.tsx`) but its `CREATE TABLE` predates the
  migrations folder, so its grants are not visible from source. Confirm in
  the Supabase dashboard that there is no stray table-level `GRANT SELECT` to
  `anon`/`authenticated` beyond the intended RLS policy.
- **Chrome Web Store publishing credentials.** `extension/.env` holds a real
  OAuth client secret and refresh token for the extension's Chrome Web Store
  publish script. It is gitignored and was never committed, so this is not an
  urgent rotation, but it sits in a OneDrive-synced folder. Low-cost
  insurance: rotate it in the Google Cloud Console OAuth client, and consider
  moving this one file out of the synced path.
- **Local `.env` / `.env.harvest` / `.env.local` in the InfluencerButler desktop
  repo.** Real Cloudflare R2 keys, the SSL.com eSigner password/TOTP secret,
  and a `FAL_KEY`, also gitignored, also never committed, also OneDrive-synced.
  Same recommendation: rotate when convenient, not urgent.

## 3. Check whether the August 2026 runbook finished

`docs/security-runbook-2026-08.md` has its own items (moving
`.env.production.local` out of OneDrive sync, rotating the service-role key,
CRON_SECRET, PayPal, Resend, Lemon Squeezy, and the `TAX_FORM_ENCRYPTION_KEY`
special case). This pass did not re-verify whether those were completed. If
you are not sure, treat that file as still open and work through it too.
