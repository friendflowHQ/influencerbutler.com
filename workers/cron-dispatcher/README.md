# ib-cron-dispatcher

A tiny Cloudflare Worker that can take over cron scheduling for the Vercel
`/api/cron/*` routes. It fires once a minute, works out which routes are due
(from the `SCHEDULE` table in `src/index.ts`, mirroring `vercel.json`), and
pings each due route with the `CRON_SECRET` bearer token the routes already
expect.

## What this is (and isn't) for

**Use it to:** stay under Vercel's 40-cron-job cap and keep all cron
scheduling in one place. Every route you move here frees one Vercel cron slot.

**It does NOT lower Vercel cost by itself.** When the dispatcher pings a route,
the work still runs inside the Vercel function, so Vercel still bills the same
Active CPU / memory for that run. The only ways to actually cut cost are:

1. **Run a route less often** — trim its entry here *and* in `vercel.json`.
2. **Port a route's logic into a Worker** that talks to Supabase/Resend
   directly, so the work leaves Vercel entirely. That's a real rewrite and only
   pays off for a heavy, frequent, self-contained route. The two hot routes
   (`affiliate-funnel`, `email-marketing`) are poor candidates: ~1,200 and ~916
   lines wired into many email/discount libraries that run on Vercel + Resend.

## Deploy

```bash
cd workers/cron-dispatcher
npx wrangler secret put CRON_SECRET   # same value as the Vercel CRON_SECRET env
npx wrangler deploy
```

Set `VERCEL_BASE_URL` in `wrangler.toml` to the deployed origin (default
`https://www.influencerbutler.com`).

## Migrate a route off Vercel's scheduler

1. Confirm the route is in the `SCHEDULE` table in `src/index.ts`.
2. **Remove that route's entry from `vercel.json`** so it isn't scheduled by
   both Vercel and this Worker.
3. Deploy the Worker, then deploy the site.

Migrate gradually — routes left in `vercel.json` keep running on Vercel. Do not
list a route in both places at once, or it runs twice per interval.

## Smoke test

```bash
# Routes due right now:
curl https://ib-cron-dispatcher.<your-subdomain>.workers.dev/due

# Fire one route immediately (does NOT bypass CRON_SECRET; the route still
# authenticates the dispatcher's bearer token):
curl https://ib-cron-dispatcher.<your-subdomain>.workers.dev/fire/seed-activity
```

## Notes

- Both Vercel crons and Cloudflare cron triggers run in **UTC**, so the cron
  expressions here are identical to `vercel.json`.
- The matcher supports `*`, `a`, `a,b`, `a-b`, `a-b/n`, and `*/n`, which covers
  every expression currently in use. It is validated by a 23-case unit check.
- `event.scheduledTime` (not `Date.now()`) drives the match, so a slightly late
  tick still evaluates the minute it was meant to fire for.
