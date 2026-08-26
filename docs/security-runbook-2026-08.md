# Security runbook: owner-only follow-ups (2026-08-27)

These are the operational steps that go with the code hardening in the same branch. Nothing here is automated: each step is something only you can safely do, because it involves live secrets and third-party dashboards. Work top to bottom.

## 0. Apply the two new database migrations to prod (do this first)

Prod Supabase is applied by hand. In the Supabase dashboard SQL editor, run, in order:

1. `supabase/migrations/20260827_profiles_column_lockdown.sql` (critical: stops users self-granting commission / repointing payouts).
2. `supabase/migrations/20260827_tax_stepup.sql` (creates the `tax_stepup` table the SSN-reveal step-up needs).

Verify the lockdown worked (read-only): from the repo, run the probe again:

```bash
node scratchpad/check-grants.mjs
```

`commission_percent`, `paypal_email`, `is_affiliate` should now return a `401/403` "permission denied for column" (they returned `204` before). `display_name` should still return `204`. Then open `/dashboard/profile` on www and confirm name / username / avatar still save.

## 1. Get live secrets out of OneDrive sync

`.env.production.local` holds 65 plaintext production secrets and lives inside the OneDrive-synced repo folder, so it is being copied to Microsoft's cloud. Fix by either:

- **Preferred:** move the whole repo out of `OneDrive\Documents\GitHub\` to a non-synced path (e.g. `C:\dev\influencerbutler.com`), or
- Exclude just this folder from OneDrive: right-click the repo folder in File Explorer, "Free up space" is not enough; use OneDrive settings, Account, Choose folders, and untick this path. On Mac the equivalent is OneDrive Preferences, Choose Folders.

Runtime does not need the file at all: Vercel injects the production env from its own dashboard. Keep a copy of the file somewhere off-sync (a password manager vault or an encrypted drive) if you want a local reference.

## 2. Rotate the exposed secrets

Because the file has been syncing, treat these as possibly-exposed and rotate them. For each: generate a new value in the provider, update it in the Vercel project (Settings, Environment Variables, Production), then redeploy so the new value takes effect.

- **Supabase service role key**: Supabase dashboard, Project Settings, API, "Reset service_role key". Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel. (The anon/publishable key is safe by design and does not need rotating.)
- **CRON_SECRET**: generate a new random string (e.g. `openssl rand -hex 32`), update `CRON_SECRET` in Vercel. No provider side.
- **PayPal**: PayPal Developer dashboard, your app, rotate the client secret. Update `PAYPAL_CLIENT_SECRET`.
- **Resend**: Resend dashboard, API Keys, roll the key. Update `RESEND_API_KEY`.
- **Lemon Squeezy**: LS dashboard, Settings, API, rotate. Update `LEMONSQUEEZY_API_KEY` (and re-check the webhook secret if you roll it).
- Lower urgency but in the same file if you want to be thorough: `GROQ_API_KEY`, `OPENAI_API_KEY`, `RECALL_API_KEY`, `SUPPORT_BOT_TOKEN`, `LICENSING_WORKER_SECRET`, `R2_READ_TOKEN`.

### Special case: `TAX_FORM_ENCRYPTION_KEY` (read before rotating)

This key decrypts stored TINs. **Rotating it makes every existing encrypted TIN undecryptable** (there is no re-encrypt path built yet). Because only a couple of affiliates have TINs on file today, the pragmatic move is:

1. Rotate `TAX_FORM_ENCRYPTION_KEY` in Vercel to a fresh 32-byte value (`openssl rand -base64 32` then trim to a 32-byte key per `tax-crypto.ts`).
2. Ask those affiliates to re-open their affiliate dashboard tax form and re-submit (a re-submit re-encrypts the TIN under the new key). Until they do, "Reveal TIN" for them will error, but the rest of the app is unaffected (the readable row keeps `tin_last4`).

If the affiliate list grows before you rotate, build the deferred re-encrypt script first (`scripts/reencrypt-tins.mjs` + a `key_version` column) instead of asking everyone to re-enter.

## 3. Confirm HTTPS hardening at the edge

Vercel serves HSTS by default on custom domains, but confirm: `curl -sI https://www.influencerbutler.com | grep -i strict-transport`. If it is absent, add a `Strict-Transport-Security` header in `next.config.ts` (deferred Medium item in the plan).

## Deferred (Medium) items captured for later

Not done in this pass: HSTS/Permissions-Policy/CSP-nonce in code, rate limiting on reveal/auth/payout routes, `TAX_FORM_ENCRYPTION_KEY` rotation support + re-encrypt script, alerting on payout-destination changes and TIN reveals, a cap on manual disburse, and `REVOKE UPDATE/DELETE` on `admin_audit_log` even from service-role. See the plan file for the full list.
