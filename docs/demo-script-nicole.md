# Demo script: Nicole Vincent interview (September 2026)

Purpose: a 15 to 20 minute live demo that answers, in order, the exact criteria Nicole used in her 2026-09-06 "Amazon Influencer Tools: Which Ones Are Actually Worth It?" live. Every step names the surface to open, what to point at, and the one sentence to say. Nothing here may be claimed unless it is shipped in the build you are demoing; see the "Do not claim" list at the end.

## Setup before going live

- Fresh Chrome profile with the published extension installed from influencerbutler.com/extension, pinned to the toolbar.
- Desktop app open, signed in, extension paired (6-digit code done ahead of time). Earnings Intelligence has a harvest from this week.
- Amazon logged in with the demo storefront. Have one search ready (a kitchen or beauty query with at least 20 results), one product page with an active Creator Connections campaign, one Creator Hub upload draft with a tagged ASIN that has a campaign, and the Creator Connections grid open in a second tab.
- DevTools Network tab ready on the orders page for the throttling demo.
- Phone on the desk with the Amazon app installed (for the deep link tap).

## The run, mapped to her checklist

1. Install and first look (30 s). Show influencerbutler.com/extension, click Add to Chrome. Say: "The extension is free, no account, every tool on this page works the moment it installs. The desktop app is the automation half; the extension is the research half."

2. Search overlay: research depth and speed (2 min). Run the prepared search. Point at the Butler Score band, the estimated $ per sale, the video count chip, the campaign chip with the real commission percent. Scroll; badges fill in as tiles enter the viewport. Say: "Every tile gets a score, a commission estimate, demand, and how many creators already have videos. It only enriches what you can see, which is why it loads fast."

3. Product page: the Keepa question (2 min). Open the product page. Point at: commission rate, BSR chip, estimated monthly units and revenue, the price and rank sparklines, the influencer video count with the upper and lower carousel split, the open-slot indicator, the competition sentence ("You'd compete with N creators"), and the seasonality chip if the product has enough history. Say: "This is the 'am I competing with 20 or 1,000 creators' answer, on the page, without a separate Keepa subscription."

4. Throttling (1 min). Open the orders page with the Network tab visible, start a 20-order content-gap scan. Point at the requests: one at a time, 2.5 to 4 seconds apart. Say: "Every Amazon request in the extension goes through one serialized fetcher with a jittered gap. It watches for the robot check and backs off for ten minutes. You never get the screen of death."

5. Creator Connections grid: Radar, fill meter, Last Call, accept (3 min). Point at the score chips, the fill meter on a nearly full campaign, tap the bell to watch it. Say: "Last Call polls one background tab every 30 minutes and notifies you before a campaign fills." Then accept one campaign from the card. If the standalone accept has shipped in this build, do it with the desktop app closed and say so; otherwise accept through the paired app and say "the app confirms against the full catalogue".

6. Video upload page (1 min). Open the Creator Hub upload draft. Point at the campaign prompt on the tagged ASIN and the duplicate-video check. Say: "It tells you the product has a campaign before you hit submit, and it catches duplicates."

7. Messaging (2 min). On a campaign, open the message composer, insert a saved template, then click AI draft and show the per-brand text. If bulk send has shipped, select three campaigns and start a paced send, showing the progress and Stop button. Say: "Unlimited. There is no per-message fee and no credit pack."

8. Deep links: the question she could not answer (2 min). On the product page click Get link. Show the URL contains the app-opening parameters, AirDrop or text it to the phone, tap it, watch the Amazon app open. Then mint a branded short link and open the Link Butler ledger (clicks, app-open rate, self-heal). Say: "Yes, Influencer Butler gives you a deep link. The plain one is free and opens the app. Branded links with analytics are the paid upgrade."

9. Global Maximizer (1 min). Scroll to the marketplace rows: availability, local price, estimated commission, and Copy all international links. Say: "One product, twelve marketplaces, every link already tagged for the right country."

10. Storefront Checkup (1 min). Run the fast scan. Point at untagged videos, over-tagged items, unavailable products, CSV export, and push to Retag Butler.

11. Desktop app: cross-posting and earnings (3 min). Video Reload Butler: Country view grid, pick a video, show localization mode Off / Captions / AI dub, and the daily drip card if shipped. YouTube Butler: daily cap, AI titles and descriptions, and the "upload my original files" option if shipped. Earnings Intelligence: Monthly Breakdown across on-site, Creator Connections, international, brand deals, then click Sync to web and open influencerbutler.com/dashboard/earnings on the phone if that has shipped.

12. Close: trial and support (1 min). Pricing: "Every Pro plan starts with a 14-day full-Pro trial. Not a lite tier, every butler unlocked. Cancel from the dashboard in one click, no ticket." Mention the Facebook group and the tutorials, and the Fluencer Fruit switch offer if it is live.

## Do not claim

- Mobile campaign accept, unless Mobile Butler (`/m`) is deployed and you can show it.
- Earnings on the web, unless `/dashboard/earnings` is deployed and shows data from your desktop sync.
- Off-site (Associates) commissions in the earnings breakdown, unless the harvest has shipped; today the column reads "not yet tracked".
- Background auto-accept or bulk messaging, unless those extension builds are published to the Web Store.
- Uploading original 4K files to YouTube or other storefronts, unless the local-source option has shipped.
- Germany and France as verified reload destinations; they are beta until a live post is QA'd.
- Any competitor name inside the Chrome Web Store listing (site pages may name them; the store listing may not).
