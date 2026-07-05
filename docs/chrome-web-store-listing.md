# Chrome Web Store submission pack (Influencer Butler extension)

Copy-paste material for the Developer Dashboard listing. Keep this file in
sync with `extension/static/manifest.json` and the extension's actual
behavior; reviewers compare the two.

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

## Pre-submission checklist

- [ ] Replace placeholder icons in `extension/static/icons/` with real art
- [ ] `cd extension && npm run build && npm run zip`
- [ ] Developer account has 2FA enabled ($5 one-time registration fee)
- [ ] Privacy policy URL live at /extension/privacy (deployed)
- [ ] After approval: put the listing URL in `CHROME_STORE_URL` in
      `src/app/extension/page.tsx` and redeploy
