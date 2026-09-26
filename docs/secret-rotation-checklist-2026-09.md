# Secret rotation checklist (2026-09-23)

Companion to `docs/security-runbook-2026-08.md`. That runbook's section 1 and section 2 were never completed: this is the tick-box version, in the order that actually works.

## What was verified on 2026-09-23

- `.env.production.local` is **still inside the OneDrive sync root**. Full path is under `C:\Users\eliza\OneDrive\...`, attributes are `Archive` (a real local file with content, not a cloud placeholder), 7,233 bytes, **65 production secrets**, last written **2026-09-03**. That is 7 days after the hardening runbook told you to move it, so the file was refreshed while still syncing.
- The file is correctly gitignored (`.env*` with `!.env.example`) and has **never** been committed to git history. The exposure is OneDrive only, not GitHub.
- Vercel "Last Updated" dates say which rotations happened:

| Vercel variable | Last updated | Rotated since the leak? |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Aug 27 | Probably yes, but see the warning below |
| `TAX_FORM_ENCRYPTION_KEY` | Jul 11 | No |
| `GA_SERVICE_ACCOUNT_JSON` | Jul 4 | No |
| `LEMONSQUEEZY_API_KEY` | Apr 20 | No |
| `CRON_SECRET` | Apr 15 | No |
| `RESEND_API_KEY` | Apr 15 | No |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Apr 13 | No |

> **Why the Supabase rotation does not count for much yet.** It was rotated Aug 27, but the local file was rewritten Sep 3 and is still syncing. So the *new* service-role key went straight back into OneDrive. Rotating before de-syncing just puts fresh secrets in the same place as the old ones. Do step 1 first.

## Read this before you start: the Sensitive/pull interaction

Converting a Vercel variable to **Sensitive** makes it write-only. `vercel env pull` will return it **empty** from then on. `.env.production.local` is exactly what `vercel env pull --environment=production` writes, and `next build` reads it for local production builds.

So decide now: if you ever run `npm run build` locally against production config, you need a copy of these values somewhere other than Vercel, because after step 4 you can never read them back out of Vercel.

**Put every value in your password manager before touching anything.**

---

## Step 1: get the file out of OneDrive (do this first)

- [ ] Copy `.env.production.local` into your password manager as a secure note, or onto an encrypted drive.
- [ ] Pick one:
  - [ ] **Preferred:** move the whole repo to a non-synced path, e.g. `C:\dev\influencerbutler.com`. This also fixes the stale-worktree reads that OneDrive causes.
  - [ ] Or exclude just this folder: OneDrive settings, Account, Choose folders, untick the path. "Free up space" is **not** enough, it leaves the content in the cloud.
- [ ] Delete the OneDrive-side copy after the move, including from the OneDrive **recycle bin** (deleted files sit there for 30 days).
- [ ] Confirm: the repo path no longer starts with your OneDrive root.

Nothing at runtime depends on this file. Vercel injects production env from its own dashboard.

## Progress as of 2026-09-23

- [x] **Step 1 done.** `.env.production.local` moved to `C:\dev\ib-secrets\`, outside the sync root. OneDrive recycle bin still needs emptying.
- [x] **`LEMONSQUEEZY_WEBHOOK_SECRET` rotated and verified.** New secret returns 200, old secret returns 400. Note: a **duplicate webhook** pointing at the same callback URL was created during the edit and still needs deleting in the LS dashboard.
- [x] **`LEMONSQUEEZY_API_KEY` rotated and verified** via a live read through `/api/subscription/variant-price`.
- [x] **`RESEND_API_KEY` rotated.** Not yet verified: verification requires an actual send.
- [x] **`CRON_SECRET` rotated and verified.** Old secret returns 401, new returns 200 against `/api/cron/support-sweep?dry=1`.
- [ ] **Fallout from that rotation: cron-job.org jobs still send the old secret.** "IB affiliate funnel" (`/api/cron/affiliate-funnel`) was auto-disabled on 2026-09-23 after 26 consecutive 401s. Update the Authorization header on every cron-job.org job and re-enable the disabled ones.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: re-rotate now that step 1 is done.
- [ ] `TAX_FORM_ENCRYPTION_KEY`, `GA_SERVICE_ACCOUNT_JSON`: not started.
- [ ] Step 4 (Sensitive conversion): not started.

## Step 2: rotate the four stale secrets

For each: generate a new value at the provider, update it in Vercel (Settings, Environment Variables, Production), then **redeploy** so it takes effect.

- [ ] **`CRON_SECRET`** (Apr 15). No provider side. Generate with `openssl rand -hex 32`. Routes check `Authorization: Bearer <secret>`, and Vercel's own cron invocations send that header automatically once the variable is set.
  - **External schedulers DO need updating.** We also drive some `/api/cron/*` routes from cron-job.org, which stores the `Authorization: Bearer <secret>` header as a literal string in each job. Rotating in Vercel makes every one of those jobs 401, and cron-job.org **auto-disables a job after enough consecutive failures** (it disabled "IB affiliate funnel" on 2026-09-23 after 26 failed attempts). After any rotation, go to cron-job.org, update the Authorization header on every job, and re-enable anything already disabled.
  - Verify: after redeploy, watch the next scheduled cron in Vercel logs for a 200, or check that an unauthorized `curl` to a `/api/cron/*` route returns 401. Then check the cron-job.org job list shows green on its next run.
- [ ] **`RESEND_API_KEY`** (Apr 15). Resend dashboard, API Keys, create a new key, update Vercel, redeploy, then revoke the old key.
  - Verify: send one test email from the admin Emails surface before revoking the old key.
- [ ] **`LEMONSQUEEZY_API_KEY`** (Apr 20). LS dashboard, Settings, API. Used by `src/lib/lemonsqueezy.ts`.
  - Verify: run a guest checkout create, or load any admin view that calls the LS API.
- [ ] **`LEMONSQUEEZY_WEBHOOK_SECRET`** (Apr 13). Used by `src/lib/webhooks.ts` for signature verification. **Sequencing matters:** the LS dashboard value and the Vercel value must change together, and there is a gap where incoming webhooks will fail signature checks.
  - Do it in a quiet window, change Vercel first, redeploy, then change LS, and replay any failed webhook deliveries from the LS dashboard afterwards.

Lower urgency, same file, rotate if you want to be thorough: `PAYPAL_CLIENT_SECRET`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET`, `SUPPORT_BOT_TOKEN`, `LICENSING_WORKER_SECRET`, `R2_READ_TOKEN`, `GOOGLE_OAUTH_CLIENT_SECRET`, `CLOUDFLARE_ACCOUNT_ID`.

- [ ] **`SUPABASE_SERVICE_ROLE_KEY`**: already rotated Aug 27, but that value has been sitting in the synced file since Sep 3. Rotate again **after** step 1 is done. Supabase dashboard, Project Settings, API, Reset service_role key. The anon key is safe by design and needs nothing.

## Step 3: the two special cases

- [ ] **`TAX_FORM_ENCRYPTION_KEY`** (Jul 11). Rotating this makes every stored encrypted TIN undecryptable: there is no re-encrypt path built. Only a couple of affiliates have TINs on file.
  - [ ] Back the current value up first. Losing it without a backup is unrecoverable.
  - [ ] If you rotate: generate with `openssl rand -base64 32` and paste the base64 string **whole**. `getKey()` in `src/lib/tax-crypto.ts` base64-decodes it and requires exactly 32 decoded bytes. The old runbook's "trim to a 32-byte key" wording is wrong and would produce an invalid key. Then ask those affiliates to re-open the affiliate dashboard tax form and re-submit, which re-encrypts under the new key. Until they do, "Reveal TIN" errors for them; `tin_last4` stays readable and the rest of the app is unaffected.
  - [ ] If the affiliate list has grown, build `scripts/reencrypt-tins.mjs` plus a `key_version` column first instead.
- [ ] **`GA_SERVICE_ACCOUNT_JSON`** (Jul 4). A multi-line JSON blob, not a string. If you rotate, create a new key on the same Google Cloud service account, paste the whole JSON verbatim, and delete the old key afterwards. A mangled paste fails silently until the admin Growth page's GA section stops loading.
  - Verify: load `/dashboard/admin/growth` and confirm the GA section renders data.

## Step 4: clear the "Needs Attention" badges

Only after steps 1 to 3, and only once every value is in your password manager.

For each of the seven flagged variables, edit it in Vercel and change the type from **Config** to **Sensitive**. Re-paste the value (the new one, where you rotated). This makes it unreadable in the dashboard, via the API, and via `vercel env pull`.

- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `TAX_FORM_ENCRYPTION_KEY`
- [ ] `GA_SERVICE_ACCOUNT_JSON`
- [ ] `LEMONSQUEEZY_API_KEY`
- [ ] `CRON_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `LEMONSQUEEZY_WEBHOOK_SECRET`
- [ ] Redeploy once at the end.

No code changes are needed. All seven are server-side only, none are `NEXT_PUBLIC_`, and all are referenced through `process.env` at runtime.

Leave `CREATORS_BACKUP_ENABLED` and `AFFILIATE_AUTOPAY_ENABLED` alone. They are already typed Secret but hold booleans, so the only effect is that you cannot read the current flag state back. Harmless, not worth changing.

## Step 5: post-rotation smoke test

- [ ] `curl -sI https://www.influencerbutler.com | grep -i strict-transport` (carried over from the old runbook, still unverified).
- [ ] Sign in on www and load `/dashboard`.
- [ ] Load `/dashboard/admin/growth` (exercises `GA_SERVICE_ACCOUNT_JSON` and the service-role key).
- [ ] Trigger one email send (exercises `RESEND_API_KEY`).
- [ ] Watch the next cron window in Vercel logs (exercises `CRON_SECRET`).
- [ ] Confirm the most recent Lemon Squeezy webhook delivery shows a 200 in the LS dashboard.

Verify on `www.` specifically, not the apex.
