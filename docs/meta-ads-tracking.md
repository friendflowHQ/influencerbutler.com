# Meta (Facebook) ads tracking: pixel, Conversions API, and lookalike audiences

Goal: run Facebook/Instagram ads powered by lookalike audiences. Meta builds a
lookalike from a seed audience, and seed audiences come from the events this
site now sends. The code shipped dark: nothing fires until the env vars below
are set, so the rollout order is (1) create the Meta assets, (2) set the vars,
(3) let events accumulate for 2-4 weeks, (4) build audiences and launch ads.

## What the site sends

Two channels feed the same dataset. The browser pixel gets blocked by ad
blockers roughly a third of the time; the server-side Conversions API (CAPI)
events are immune, which is why the high-value events are server-side.

| Event | Channel | Fires when | Source |
| --- | --- | --- | --- |
| PageView | browser | every page load and client-side navigation | `src/components/MetaPixel.tsx` |
| InitiateCheckout | browser | a pricing-card Buy button opens checkout | `src/app/pricing/PricingCardsClient.tsx` |
| Lead | server | a Start Free Trial / Download CTA is clicked (bot-filtered, 1-hour dedup per browser) | `src/app/api/trial/start/route.ts` |
| CompleteRegistration | server | a new account signs in for the first time (both password and magic-link paths) | `src/app/api/auth/callback/route.ts`, `src/app/api/analytics/signup/route.ts` |
| StartTrial | server | Lemon Squeezy reports a new on_trial subscription | LS webhook `subscription_created` |
| Purchase | server | Lemon Squeezy reports a paid order (value + currency attached; $0 trial orders skipped; renewals count again) | LS webhook `order_created` |

Browser identity (`_fbp`/`_fbc` cookies) rides through Lemon Squeezy checkout
custom_data so even the webhook-fired Purchase can match back to the browser
that clicked the ad. Retried webhooks are harmless: every server event uses a
deterministic event_id and Meta drops repeats within 48 hours.

## One-time setup

### 1. Create the pixel/dataset

1. Go to [Meta Events Manager](https://business.facebook.com/events_manager2)
   (create a Business Manager and ad account first if none exists).
2. Connect data sources > Web > name it (for example "Influencer Butler
   site") and finish with "Meta Pixel" / "Conversions API and Pixel".
3. Copy the **Dataset ID** (also called Pixel ID): a long number shown at the
   top of the data source page.

### 2. Generate the Conversions API token

1. In Events Manager, open the dataset > **Settings**.
2. Scroll to **Conversions API** > "Set up manually" > **Generate access
   token**.
3. Copy the token somewhere safe; Meta shows it once.

### 3. Set the env vars in Vercel

In the Vercel dashboard (Project > Settings > Environment Variables), add to
Production (and Preview if you want staging traffic tracked):

- `NEXT_PUBLIC_META_PIXEL_ID` = the Dataset ID from step 1
- `META_CAPI_ACCESS_TOKEN` = the token from step 2

Do NOT set `META_TEST_EVENT_CODE` in production; it is only for the
verification step below. Redeploy after adding the vars (env changes need a
new deployment).

## Verifying it works

1. In Events Manager open the dataset > **Test events** tab and copy the code
   (looks like `TEST12345`).
2. Locally: put all three vars in `.env.local` (including
   `META_TEST_EVENT_CODE`), run the dev server, and click through the site.
   Server events (Lead, Purchase, ...) appear in the Test events tab within
   seconds. Browser events appear when the pixel loads (test-event tagging
   for browser events requires the code in the fbq call, so verify browser
   events with the [Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc)
   Chrome extension instead: it shows PageView and InitiateCheckout firing).
3. Production smoke test after deploy: browse the live site with Pixel
   Helper, then check Events Manager > Overview a few minutes later for
   PageView traffic.
4. Purchase check: after the next real sale, open the Purchase event in
   Events Manager and confirm "Event match quality" lists email and external
   ID (and browser ID when the buyer came through the site checkout).

## Seed audience you can build TODAY (no waiting)

Existing customers are the best lookalike seed and need zero site data:

1. In the Lemon Squeezy dashboard: Store > Customers > Export, download the
   CSV.
2. In [Ads Manager > Audiences](https://business.facebook.com/adsmanager/audiences):
   Create audience > Custom audience > Customer list, upload the CSV (map the
   email column). Meta hashes the file in your browser during upload; the raw
   emails never leave your machine unprotected.
3. Create audience > Lookalike audience > pick that customer list as the
   source, country United States (or your top ad market), size 1%.

A lookalike wants a source of at least ~100 people in one country (1,000+
works much better). If the customer list is small, let the site events below
fatten the seed first.

## Audience playbook (after 2-4 weeks of events)

Build these website custom audiences (Audiences > Create audience > Custom
audience > Website):

- All site visitors, last 180 days (broad retargeting + fallback seed)
- Visited /pricing, last 30 days (warm retargeting)
- Lead event, last 30 days (clicked a trial CTA)
- StartTrial event, last 180 days
- Purchase event, last 180 days (the money seed)

Then create lookalikes, best seed first: Purchase > StartTrial > Lead. Start
with 1% lookalikes; widen to 2-3% when you need cheaper reach. Point the ad
sets' optimization at the Purchase or StartTrial conversion event so Meta
optimizes toward buyers, not clickers.

## Notes

- Everything no-ops with the env vars unset; there is no consent banner on
  the site today and the pixel follows the same posture as the existing GA4
  tag.
- The pixel writes the `_fbp`/`_fbc` cookies itself; no extra fbclid handling
  exists or is needed.
- Server module: `src/lib/meta-capi.ts`. Client helper: `trackMetaEvent` in
  `src/lib/analytics-client.ts`.
