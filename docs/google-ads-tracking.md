# Google Ads tracking: conversion tag, remarketing, and audiences

Goal: run Google Ads (Search / Performance Max / Display) with conversion
tracking and remarketing audiences. The tag rides the same gtag.js that already
powers GA4, so there is almost nothing to load: you paste one id, then paste a
conversion label per action. It ships dark: nothing fires until the id below is
set.

## How it is wired

- The Google Ads global site tag is the GA4 gtag.js instance that
  `public/js/consent.js` already loads. Adding Google Ads is one extra
  `gtag("config", "AW-XXXXXXXXX")`, guarded by the `GOOGLE_ADS_ID` constant in
  that file.
- Remarketing and conversions ride the `ad_storage` + `ad_personalization`
  consent signals, which Consent Mode only grants after the visitor clicks
  "Accept all" on the cookie banner. Nothing builds an audience without consent.
- Conversion events fire through `trackAdsConversion(sendTo, params)` in
  `src/lib/analytics-client.ts`. Call sites pass a per-conversion-action label.
- CSP: `googleads.g.doubleclick.net`, `td.doubleclick.net`, and
  `www.google.com` are allowlisted in `next.config.ts` (the tag JS itself loads
  from `googletagmanager.com`, already allowed).

## What the site sends

| Event | Fires when | Source |
| --- | --- | --- |
| Remarketing page view | every page (via the `AW-` config) | `public/js/consent.js` |
| Checkout conversion | a pricing-card Buy button opens checkout | `src/app/pricing/PricingCardsClient.tsx` (`GOOGLE_ADS_CHECKOUT_CONVERSION`) |
| Trial/Lead conversion | a Start Free Trial / Download CTA is clicked | `public/download-guidance.js` (`GOOGLE_ADS_TRIAL_CONVERSION`) |

## One-time setup

### 1. Get the Google Ads conversion id

1. In [Google Ads](https://ads.google.com), open **Tools > Conversions**.
2. Create a conversion action (or open an existing one). For the two above,
   create a "Website" action for the purchase/checkout and one for the trial
   lead. You can mark the checkout one as Primary and the lead as Secondary.
3. On the action's tag setup, choose "Use Google tag". The id is
   `AW-XXXXXXXXX` (the "Conversion ID"); the per-action label is the
   `send_to` suffix, shaped `AW-XXXXXXXXX/abcDEFgh...` (the "Conversion label").

### 2. Fill the id and labels

- Paste the `AW-XXXXXXXXX` id into `GOOGLE_ADS_ID` in
  `public/js/consent.js`.
- Paste each action's full `AW-XXXXXXXXX/label` into its call-site constant:
  `GOOGLE_ADS_CHECKOUT_CONVERSION` in `PricingCardsClient.tsx` and
  `GOOGLE_ADS_TRIAL_CONVERSION` in `public/download-guidance.js`.
- Commit and deploy. Unlike Meta, these ids are not secret and are not env
  vars; they live in committed code next to the GA4 id.

## Verifying it works

1. Install the [Google Tag Assistant](https://tagassistant.google.com) or use
   GA4 DebugView.
2. Load the live site, click "Accept all", and confirm the `AW-` config loads
   and the `conversion` event fires on checkout / trial click.
3. Confirm the browser console shows no `Content Security Policy` errors for
   `doubleclick.net` or `google.com`.
4. In Google Ads, the conversion action's status moves from "No recent
   conversions" to "Recording conversions" within a day of real traffic.

## Remarketing audiences

In Google Ads > **Tools > Audience manager > Your data segments**, create
website segments once the tag has traffic:

- All visitors (broad remarketing)
- Visited /pricing (warm)
- Converters to exclude from prospecting

Point Search/PMax campaigns at the checkout conversion action so Google
optimizes toward buyers.

## Notes

- Dark by default: with `GOOGLE_ADS_ID` empty the config line and every
  conversion call no-op, so this is safe to ship before the ad account exists.
- Same consent posture as GA4 and the Meta pixel: no advertising signal is sent
  until "Accept all".
