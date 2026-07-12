# Chrome Web Store submission pack (Influencer Butler extension)

Copy-paste material for the Developer Dashboard listing. Keep this file in
sync with `extension/static/manifest.json` and the extension's actual
behavior; reviewers compare the two.

For shipping new **code** (as opposed to editing this listing copy), see
[chrome-web-store-publishing.md](chrome-web-store-publishing.md): the release is
automated as `npm run bump` + `npm run release`.

Privacy policy URL (required field):
`https://www.influencerbutler.com/extension/privacy`

## Single purpose description

Free tools for Amazon Influencers on the Amazon pages they already browse:
shows how many videos a product has and who made them (influencer, brand,
customer), finds products in the user's own order history with few or no
influencer videos, evaluates opportunity criteria, calculates break-even
math, and checks the user's own storefront for untagged videos and
unavailable tagged products.

## Permission justifications

**storage**
Saves the user's settings (commission rate, thresholds, tool toggles), a
short-lived local cache of scan results, the queue of findings waiting to
sync, and (only if the user connects an account) their license key. All in
chrome.storage.local; nothing is placed in synced storage.

**alarms**
Wakes the background service worker on a fixed interval (every 2 minutes) to
send queued findings to the user's own Influencer Butler dashboard when the
user has connected their license key and enabled sync. No alarms are used
for tracking or background crawling.

**Host permission: https://www.amazon.com/***
The extension's entire purpose is analyzing Amazon pages the user visits:
product pages (video counts, opportunity criteria, price), the user's own
order history, and the user's own storefront. Content scripts read these
pages locally. The only additional requests are user-initiated scans
(explicit button clicks) that fetch product pages one at a time using the
user's own session.

**Host permission: https://www.influencerbutler.com/***
Used exclusively to (a) verify the license key the user pastes into the
popup and (b) upload the user's own findings to their Influencer Butler
dashboard when sync is enabled. No other endpoints are contacted.

**remote code**: none. All code ships in the package; no eval, no remote
scripts.

## Data usage disclosures (the checkbox form)

Declare collected:

- **Authentication information**: the user's Influencer Butler license key,
  stored locally and transmitted only to influencerbutler.com as the
  authorization header when the user opts in to sync.
- **Website content**: product-level data read from Amazon pages the user
  views or scans (ASIN, title, price, video counts, storefront issue types),
  transmitted to influencerbutler.com only when the user opts in to sync.

Declare NOT collected: personally identifiable information, health,
financial and payment information, personal communications, location, web
history, user activity (clicks, keystrokes), anything from other sites.

Certify all three usage statements (they are true):

1. Data is not sold to third parties, and is not used or transferred for
   purposes unrelated to the extension's single purpose.
2. Data is not used or transferred to determine creditworthiness or for
   lending purposes.
3. Data handling complies with the Developer Program Policies.

## Listing copy pointers

- Short description (under 132 chars): "See influencer vs brand video counts
  on any Amazon product, find content gaps in your orders, and check your
  storefront. Free."
- Frame everything as "insights while you browse", not "automation":
  the extension reads pages the user visits and only fetches on explicit
  clicks, which is the right side of the program policies.
- Screenshots at 1280x800: the product-page panel, the order-history scan
  results, the storefront checkup, and the popup.
- Category: Shopping. Language: English.

## Final submitted copy (2026-07-09)

The exact text pasted into the Developer Dashboard for the first submission.
Reuse verbatim on updates unless behavior changes.

### Store listing tab

- Category: Shopping. Language: English (United States).
- Homepage URL: `https://www.influencerbutler.com`
- Support URL: `https://www.influencerbutler.com/help`
- Store icon: `public/assets/extension/store-icon-128.png` (128x128, brand logo
  downscaled from `public/assets/influencer-butler-logo.png` via sharp).
- Screenshot: `public/assets/extension/extension_product_page_1280x800.png`
  (1280x800, 24-bit PNG no alpha; letterboxed on white from the 1920x1116
  `extension_product_page_view_version_1.0.png`). Promo tiles left blank
  (optional).
- Detailed description:

```
Influencer Butler puts free, no-nonsense tools right on the Amazon pages you already browse, so you can spot opportunities and check your work without leaving the page.

WHAT YOU GET (all free):

Video counts on any product
See how many videos a product has and who made them: influencer, brand, or customer. Instantly tell whether a product is saturated or wide open for your next video.

Content gaps in your own orders
Scan your Amazon order history to find products you have bought that have few or no influencer videos yet: your easiest next content ideas, ranked and exportable.

Butler Approved seals
A clear opportunity signal on product pages so you know at a glance whether something is worth filming.

Break-even math
Quick profit and break-even calculations using the product's commission rate, so you know what a video needs to earn to be worth it.

Storefront checkup
Scan your own storefront for untagged videos and unavailable tagged products, and export the results as a CSV to clean up your shop.

HOW IT WORKS
The extension reads the Amazon pages you visit and only fetches additional pages when you explicitly click a scan button. Everything it computes stays on your device unless you choose to connect your Influencer Butler account to sync findings to your dashboard.

Free to use. Optional sign-in with an Influencer Butler license key unlocks syncing to your dashboard at influencerbutler.com.
```

### Privacy tab

Single purpose description:

```
Influencer Butler gives Amazon Influencers insights on the Amazon pages they already browse: it shows how many videos a product has and who made them (influencer, brand, or customer), finds products in the user's own order history that have few or no influencer videos, evaluates opportunity criteria, calculates break-even commission math, and checks the user's own storefront for untagged videos and unavailable tagged products.
```

storage justification:

```
Stores the user's own settings (commission rate, thresholds, tool on/off toggles, language), a short-lived local cache of scan results, and the queue of findings waiting to sync. If the user connects their account, their Influencer Butler license key is stored locally. Everything is kept in chrome.storage.local on the user's device; nothing is placed in synced storage.
```

alarms justification:

```
Wakes the background service worker on a fixed interval to flush the user's queued findings to their own Influencer Butler dashboard when they have connected a license key and enabled sync, and to run optional watchlist checks the user has turned on. Alarms are never used for background crawling, tracking, or advertising.
```

notifications justification:

```
Shows optional desktop notifications only for features the user explicitly enables: back-in-stock, price-drop, or new-opportunity alerts for products the user added to a watchlist, plus a couple of one-time getting-started tips. No notifications are used for advertising or tracking, and none fire unless the user opts in.
```

tabs justification:

```
Used to briefly open an Amazon product page in an inactive background tab so the page's video carousel can load, which lets the extension read the influencer/brand/customer video counts that only appear after that widget renders. The tab is closed automatically when the scan finishes. This runs only when the user clicks a scan button or has enabled watchlist checks.
```

Host permission justification:

```
The extension's single purpose is analyzing Amazon pages the user is viewing. Content scripts on www.amazon.com, .ca, and .co.uk read product pages, search results, and the user's own order history and storefront to show video counts, opportunity seals, break-even math, and storefront issues. User-initiated scans (button clicks) fetch additional Amazon pages one at a time using the user's own session. The www.influencerbutler.com host is used only to verify the license key the user pastes in and to upload the user's own findings to their own dashboard when they enable sync. No other hosts are contacted by default; optional provider hosts (OpenAI, Amazon PA-API) are requested at runtime only if the user configures those integrations.
```

Remote code: **No, I am not using remote code.** Verified in source: no
eval/new Function/importScripts/external scripts; esbuild bundles everything.
Network calls fetch data, not code.

Data usage: check ONLY "Authentication information" (license key) and
"Website content" (Amazon product data). Certify all three statements true.

## Pre-submission checklist

- [x] Branded icons in `extension/static/icons/` (vector butler mark rendered
      by `npm run icons`; edit `extension/scripts/assets/icon.html` to tweak)
- [x] `cd extension && npm run build && npm run zip` (manifest description
      trimmed to 123 chars; 132 is the hard limit)
- [x] Developer account has 2FA enabled ($5 one-time registration fee) - paid,
      trader account verified
- [x] Privacy policy URL live at /extension/privacy (deployed, confirmed)
- [ ] Submit for review (Distribution tab set to Public first)
- [ ] After approval: set `NEXT_PUBLIC_CHROME_STORE_URL` to the listing URL in
      the Vercel env (read by `src/app/extension/page.tsx`) and redeploy
