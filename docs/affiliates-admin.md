# Affiliate program — admin guide

This doc covers running the Influencer Butler affiliate program. The system has three moving parts: our Supabase tables, the Lemon Squeezy affiliate feature, and the consolidated dashboard at `/dashboard/affiliates`. Approval is automated — one click in the admin page creates the Lemon Squeezy record, links it to the user, and emails them.

## Environment variables

Add to your production environment (and `.env.local` for local dev):

```
# Existing
LEMONSQUEEZY_API_KEY=<shared with subscriptions>
RESEND_API_KEY=<optional — needed for admin + approval emails>
ADMIN_NOTIFICATION_EMAIL=<optional — recipient for new application emails>
SUPABASE_SERVICE_ROLE_KEY=<required for admin endpoints>

# New (required for approval automation)
LEMONSQUEEZY_STORE_ID=<your LS store numeric ID>
ADMIN_EMAILS=<comma-separated list of admin emails>

# Optional
NEXT_PUBLIC_LEMONSQUEEZY_AFFILIATE_SIGNUP_URL=https://influencerbutler.lemonsqueezy.com/affiliates
```

**Finding `LEMONSQUEEZY_STORE_ID`**: LS dashboard → **Settings** → **Stores** → click your store. The URL shows `/stores/<id>`; that number is the Store ID.

**`ADMIN_EMAILS`**: comma-separated lowercase emails that are allowed to access `/dashboard/admin/*` endpoints and page. Example: `you@influencerbutler.com,partner@influencerbutler.com`.

## Database setup

Run these migrations once in the Supabase SQL editor:

1. `supabase/migrations/20260415_affiliates.sql` — adds `is_affiliate` / `ls_affiliate_id` columns to `profiles` and creates `affiliate_applications` with RLS.
2. `supabase/migrations/20260416_affiliate_applications_email_rls.sql` — extends the SELECT policy so users can read their own application by email too (handles the edge case where an applicant's `user_id` changed after email confirmation).

## Review + approval flow

When someone submits the form at `/affiliates/apply` (or inline at `/dashboard/affiliates` if they were already signed in):

1. A Supabase auth user is created (or reused if they were already signed in).
2. A row is upserted into `affiliate_applications` with `status = 'pending'`.
3. If `RESEND_API_KEY` + `ADMIN_NOTIFICATION_EMAIL` are set, you receive an email summary.

### To approve (automated, one click)

1. Go to `/dashboard/admin/affiliates` while signed in as an email listed in `ADMIN_EMAILS`.
2. Click **Approve** on the applicant's row.

Under the hood that:
- Calls Lemon Squeezy `POST /v1/affiliates` to create the affiliate record
- Stores the returned ID on `profiles.ls_affiliate_id` + sets `is_affiliate = true`
- Marks the application `status = 'approved'` with `admin_notes = 'Approved by <your email>'`
- Sends the applicant an email with their referral link (if `RESEND_API_KEY` is set)

On next reload of `/dashboard/affiliates` the applicant sees the full affiliate dashboard (stats, share link, sparkline).

### To reject (automated)

1. On `/dashboard/admin/affiliates`, click **Reject** on the applicant's row.
2. Optionally add a reason when prompted — it's stored in `admin_notes`.

Rejection only updates the application row; the user's Supabase account stays intact. Email them out-of-band if you'd like to explain.

### Manual approval (fallback)

If the automated endpoint fails (e.g. Lemon Squeezy is down) you can still approve by hand:

```sql
-- 1. Create the affiliate manually in the LS dashboard → Affiliates → Add affiliate.
--    Grab the numeric ID from the URL.

-- 2. Link it to the user:
UPDATE profiles
  SET is_affiliate = true, ls_affiliate_id = '<LS_AFFILIATE_ID>'
  WHERE id = '<SUPABASE_USER_ID>';

UPDATE affiliate_applications
  SET status = 'approved', reviewed_at = now()
  WHERE user_id = '<SUPABASE_USER_ID>';
```

To find the user's ID:

```sql
SELECT id FROM auth.users WHERE email = '<applicant_email>';
```

## Commission structure

- 35% recurring commission on every subscription payment.
- 30-day referral cookie.
- Last-click attribution.
- Payouts managed by Lemon Squeezy.

If you change these in LS, update the copy in:

- `src/app/affiliates/page.tsx`
- `src/app/affiliates/EarningsCalculator.tsx` (`COMMISSION_RATE`, `AVG_PLAN_PRICE`)
- `src/app/affiliates/FaqAccordion.tsx`
- `src/app/dashboard/affiliates/AffiliateDashboard.tsx` (InfoRow values + approval email copy in `src/app/api/affiliates/approve/route.ts`)

## API endpoints (reference)

All admin endpoints require `ADMIN_EMAILS` + `SUPABASE_SERVICE_ROLE_KEY` to be configured and a logged-in session whose email is in the allowlist.

- `GET  /api/affiliates/admin-list` — returns all pending applications.
- `POST /api/affiliates/approve` — body `{ userId }`. Creates LS affiliate, updates Supabase, sends email.
- `POST /api/affiliates/reject`  — body `{ userId, reason? }`. Marks application rejected.
- `GET  /api/affiliates/me`       — current user's own affiliate state (public, gated by auth).
- `POST /api/affiliates/me`       — body `{ lsAffiliateId }`. Fetches LS stats for a signed-in user's own affiliate ID.

## Troubleshooting

- **Dashboard shows "couldn't load stats"** — the LS API call failed. Verify `LEMONSQUEEZY_API_KEY` is valid and the `ls_affiliate_id` in the user's profile matches a real record in LS.
- **Dashboard stays on "Application under review"** — the user's `profiles.ls_affiliate_id` is still null. Approve via `/dashboard/admin/affiliates` or run the manual SQL above.
- **Admin page shows "Forbidden"** — add your email to `ADMIN_EMAILS` (comma-separated, case-insensitive) and redeploy.
- **Approve button returns `LEMONSQUEEZY_STORE_ID env var is not set`** — add it (see Environment variables above).
- **Approve button returns 502** — Lemon Squeezy rejected the create call. Check server logs for the LS response body.
- **User never gets to sign in** — Supabase may require email confirmation. The apply page shows a "Check your email to confirm" message when that happens.
