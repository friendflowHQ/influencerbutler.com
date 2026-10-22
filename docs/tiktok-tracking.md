# TikTok tracking: pixel, conversions, and retargeting audiences

Goal: run TikTok ads powered by conversion and retargeting/lookalike audiences.
The TikTok Pixel is wired exactly like the Meta Pixel: env-gated and
consent-gated, with an App Router component and a build-time codemod for the
static pages. It ships dark: nothing fires until the env var below is set.

## How it is wired

- App Router: `src/components/TikTokPixel.tsx` loads the `ttq` base snippet and
  fires `ttq.page()` on load and on every client-side navigation. Renders
  nothing unless `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set and the visitor granted
  advertising consent.
- Static `public/**/*.html`: `scripts/inject-tiktok-pixel.mjs` (run from
  `prebuild`) syncs the same consent-gated snippet in when the env var is set
  and strips it when unset, so committed HTML stays pixel-free.
- Consent: the same `public/js/consent.js` source as Meta (the pixel loads only
  after "Accept all", via the `ib_ads_consent` cookie + `ib-consent-change`).
- Events: `trackTikTokEvent(name, params)` in `src/lib/analytics-client.ts`.
- CSP: `analytics.tiktok.com` is allowlisted in `next.config.ts`.

## What the site sends

| Event | Fires when | Source |
| --- | --- | --- |
| Pageview | every page load and client-side navigation | `src/components/TikTokPixel.tsx` + static snippet |
| InitiateCheckout | a pricing-card Buy button opens checkout | `src/app/pricing/PricingCardsClient.tsx` |
| Lead | a Start Free Trial / Download CTA is clicked | `public/download-guidance.js` |

Scope note: this is the browser pixel only. TikTok also offers a server-side
Events API (the equivalent of Meta's CAPI) for ad-blocker-resilient events; it
is a possible follow-up, not built here.

## One-time setup

### 1. Create the pixel

1. In [TikTok Ads Manager](https://ads.tiktok.com), open **Assets > Events >
   Web events** and "Set up web events".
2. Choose "TikTok Pixel" and the "Manually install the code" / "Developer mode"
   path (we install the code ourselves, not via Partner).
3. Copy the **Pixel ID** (the `sdkid`).

### 2. Set the env var in Vercel

In the Vercel dashboard (Project > Settings > Environment Variables), add to
Production (and Preview if you want staging traffic tracked):

- `NEXT_PUBLIC_TIKTOK_PIXEL_ID` = the Pixel ID from step 1

Redeploy after adding the var (env changes need a new deployment, and the
static-page codemod runs at build time).

## Verifying it works

1. Install the [TikTok Pixel Helper](https://chromewebstore.google.com/detail/tiktok-pixel-helper/aelgobmabdmlfmiblddjfnapgcfgaald)
   Chrome extension.
2. Put the id in `.env.local`, run the dev server, click "Accept all", and
   confirm the helper shows the pixel firing Pageview and InitiateCheckout.
3. Confirm the browser console has no `Content Security Policy` errors for
   `analytics.tiktok.com`.
4. In Events Manager, the pixel's "Test events" tab shows events within seconds
   while you browse.

## Audiences

In TikTok Ads Manager > **Assets > Audiences**, after the pixel has traffic:

- Website visitors (broad retargeting)
- Visited /pricing (warm)
- InitiateCheckout (high intent)

Create a lookalike from the strongest converter audience, and point ad groups'
optimization at the InitiateCheckout (or a Purchase event, once added) so
TikTok optimizes toward buyers.

## Notes

- Dark by default: with `NEXT_PUBLIC_TIKTOK_PIXEL_ID` unset, the component
  renders nothing, the static snippet is stripped at build, and every
  `trackTikTokEvent` call no-ops.
- Same consent posture as Meta and GA4: no event fires until "Accept all".
