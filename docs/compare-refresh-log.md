# Compare page refresh log

Biweekly refresh of `public/compare/*.html`. The scheduled task skips a run if the newest entry below is less than 13 days old. Newest entry first.

## 2026-11-10

First logged run (no earlier log existed).

### Pages changed

- `influencer-butler-vs-viral-vue.html`: Viral Vue's pricing page now lists Free, Starter $33/mo ($390/yr), Professional $66/mo ($790/yr); page said "$39/mo". Updated entry price, FAQ + JSON-LD, credited "Brand Message Automation" (Professional) in the AI messaging row, added a dated update section. No rating on this page.
- `logie-extension-review.html`: logie5.com/pricing lists Silver $59, Gold $99, Platinum $199 per month, or $597 / $997 / $1,997 per year ($49.75 / $83.08 / $166.42 per month). The page's "up to around $166 per month" was the yearly-billed figure only. Updated copy, cons, FAQ + JSON-LD, added credits per plan, the 14-day paid trial, and the homepage's paid-plan "cloud computer" (runs 24/7 while your computer is off; untested by us). Rating kept at 3.8 (structure and credit metering unchanged), reason stated on the page.
- `cha-ching-vs-logie-vs-influencer-butler.html`: Logie entry price cell now "$59+ per month ($49.75+ billed yearly)".
- `oink-alternatives.html`: roundup table rows for Viral Vue ($33/mo and up) and Logie ($59 to $199/mo) corrected.
- `public/sitemap.xml`: `<lastmod>` 2026-11-10 for the four pages above.

### Outside public/compare (factually wrong competitor mention)

- `src/app/dashboard/affiliates/CompetitorPlaybook.tsx`: Logie tag said "up to $166/mo"; now shows $59 to $199/mo or $49.75 to $166/mo yearly. Entry-price cell updated to match.

### Checked, no change

- `cha-ching-review.html`: cha-ching-automate site still lists $20/mo ($200/yr); now says "up to 18" storefronts (13 default + 5 optional), consistent with the page's "13+". No change.
- `influencer-butler-vs-oink.html`, `oink-vs-campaign-finder-vs-influencer-butler.html`: Oink still $29.99/mo, free tier, "40+" tools. (Its yearly plan is $249.99/yr; our pages do not quote a yearly price.) No change.
- `fluencer-fruit-alternatives.html`: page deliberately describes Fluencer Fruit in general terms only; no public pricing found. No change.
- Our own claims re-verified against `src/lib/pricing-constants.ts`: Pro $39/mo, $390/yr, 14-day trial.

### Unverified

- Amazon automatically cross-posting Influencer Program videos to other marketplaces with translation/captions: no Amazon source found. aboutamazon.com explainer (Sep 16, 2026) only says storefront videos are "eligible to appear across Amazon"; the only Amazon cross-store video item is the Nov 2024 seller feature for seller-uploaded listing videos. Cha-Ching's site now refers to an Amazon "Global Storefront" that shares videos across merged storefronts; not confirmed by Amazon. `cha-ching-review.html` keeps its existing "reported, not confirmed" wording.
- Logie's "cloud computer" 24/7 runner: vendor claim only.
- Viral Vue's homepage still has a "Join the waitlist" block while /join and /pricing offer instant sign-up; treated as live.
- Campaign Finder: no public pricing or feature source checked this run; page already avoids stating its prices.
- Logie also runs a 30%-off intro offer ending Nov 30, 2026 (temporary, not added to pages).

### Suggested new competitors (no pages created)

- None new with enough public detail this run. JoyLink is tracked in the internal affiliate playbook but has no public compare page; consider one if wanted.
