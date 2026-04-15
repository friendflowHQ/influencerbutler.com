# Affiliate program — admin guide

This doc covers the manual operations for running the Influencer Butler affiliate program. The system has three moving parts: our Supabase tables, the Lemon Squeezy affiliate feature, and the portal UI at `/affiliates/portal`.

## Environment variables

Add to your production environment (and `.env.local` for local dev):

```
NEXT_PUBLIC_LEMONSQUEEZY_AFFILIATE_SIGNUP_URL=https://influencerbutler.lemonsqueezy.com/affiliates
RESEND_API_KEY=<optional — enables admin application emails>
ADMIN_NOTIFICATION_EMAIL=<optional — recipient for new application emails>
```

`LEMONSQUEEZY_API_KEY` (already configured for subscriptions) is reused to fetch affiliate stats.

## Database setup

Run `supabase/migrations/20260415_affiliates.sql` once in the Supabase SQL editor. It:

- Adds `is_affiliate BOOLEAN` and `ls_affiliate_id TEXT` columns to `profiles`.
- Creates `affiliate_applications` with RLS (each user can read/insert/update their own pending row).

## Review + approval flow

When someone submits the form at `/affiliates/apply`:

1. A Supabase auth user is created (or reused if they were already signed in).
2. A row is upserted into `affiliate_applications` with `status = 'pending'`.
3. If `RESEND_API_KEY` + `ADMIN_NOTIFICATION_EMAIL` are set, you receive an email summary. Otherwise, check pending applications with:

```sql
SELECT id, user_id, full_name, email, website, social_handles, audience_size, niche, promotion_strategy, created_at
FROM affiliate_applications
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### To approve an applicant

1. In the **Lemon Squeezy dashboard** → **Affiliates**, click **Add affiliate**. Use the applicant's name and email. Save the new affiliate's ID (e.g. `42`).
2. In the Supabase SQL editor, link the affiliate ID to the user and mark the application approved:

```sql
UPDATE profiles
  SET is_affiliate = true, ls_affiliate_id = '<LS_AFFILIATE_ID>'
  WHERE id = '<SUPABASE_USER_ID>';

UPDATE affiliate_applications
  SET status = 'approved', reviewed_at = now()
  WHERE user_id = '<SUPABASE_USER_ID>';
```

3. The applicant can now log in at `/login` and see live stats at `/affiliates/portal`.

### To reject an applicant

```sql
UPDATE affiliate_applications
  SET status = 'rejected', reviewed_at = now(), admin_notes = '<reason>'
  WHERE user_id = '<SUPABASE_USER_ID>';
```

The applicant's Supabase account stays intact but they won't have an LS affiliate record, so the portal stays in the pending state. Email them out-of-band.

## Commission structure

- 35% recurring commission on every subscription payment.
- 30-day referral cookie.
- Last-click attribution (the last referrer to drive the click before purchase gets the credit).
- Payouts managed by Lemon Squeezy.

These values are shown to applicants in the marketing page and portal UI. If you change them in LS, update the copy in:

- `src/app/affiliates/page.tsx`
- `src/app/affiliates/EarningsCalculator.tsx` (`COMMISSION_RATE`, `AVG_PLAN_PRICE`)
- `src/app/affiliates/FaqAccordion.tsx`
- `src/app/affiliates/portal/page.tsx` (InfoRow values)

## Troubleshooting

- **Portal shows "couldn't load stats"** — the LS API call failed. Verify `LEMONSQUEEZY_API_KEY` is valid and the `ls_affiliate_id` in the user's profile matches a real record in LS.
- **Portal stays on "Application under review"** — the user's `profiles.ls_affiliate_id` is still null. Run the approve SQL above.
- **User never gets to sign in** — Supabase may require email confirmation. The apply page shows a "Check your email to confirm" message when that happens.
