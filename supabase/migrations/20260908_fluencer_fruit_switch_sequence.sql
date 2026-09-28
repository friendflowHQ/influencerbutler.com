-- Fluencer Fruit switch: five-step drip for creators moving over before it closes.
--
-- Fluencer Fruit (a product research / campaign finder tool for Amazon
-- influencers) retires at the end of September 2026. The landing page at
-- /switch/fluencer-fruit captures an email (POST /api/switch/subscribe), which
-- records the contact with source + tag "fluencer-fruit-switch" and calls
-- enrollForTagAdded. This migration seeds the ONE tag-triggered sequence that
-- tag enrolls into:
--   fluencer-fruit-switch -> Day 0 map + offer, day 2 product research, day 5
--                            campaigns, day 9 links + cross-posting, day 13
--                            "closes this month" + offer expiry.
--
-- The offer ("your first six weeks of Pro free", Lemon Squeezy code FRUITSWITCH)
-- renders on the landing page only while FLUENCER_SWITCH_ENABLED=1 is set in
-- Vercel AND the FRUITSWITCH discount exists in Lemon Squeezy. The emails link
-- to the page rather than straight to checkout, so a dark offer never promises a
-- price the checkout cannot show.
--
-- Created PAUSED. Nothing sends until you Activate it in the UI.
-- ACTIVATE BEFORE THE PAGE GOES LIVE: enrollForTagAdded only enrolls ACTIVE
-- sequences, so anyone who submits the form while this is paused is tagged but
-- not enrolled. For those, use Enroll > By tag (fluencer-fruit-switch) to backfill.
--
-- Throttled to 25 sends/hour, send_hour = 9 (America/Denver), track_opens = true.
-- Sent via the compliant marketing sender (one-click unsubscribe + postal footer
-- auto-appended, suppression honored). Do not add either to the body copy.
-- Bodies are plain text: the sequence sender renders them to trackable HTML
-- itself (plainTextToTrackableHtml) and links bare URLs.
--
-- Depends on 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql,
-- 20260831_sequence_send_hour.sql, 20260902_sequence_track_opens.sql.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER those migrations. Idempotent (ON CONFLICT DO
-- NOTHING); revise copy later via a separate _rewrite.sql that UPDATEs by
-- sequence_id + position.

INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e000b-0000-4000-a000-00000000000b',
  'Fluencer Fruit switch',
  'paused',
  '{"kind":"tag_added","tag":"fluencer-fruit-switch"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e000b-0000-4000-a000-00000000000b', 1, 0,
    'Your map from Fluencer Fruit to Influencer Butler',
    'Hi,

It is Liz Dean from Influencer Butler. You asked for the map, so here it is: where each thing you used Fluencer Fruit for now lives, and what it costs.

- Product research -> Butler Score, BSR + estimated revenue with price history, and the search overlay. Free Chrome extension, no login.
- Campaign finder -> Campaign Radar with fill meters and Last Call watch bells on the Creator Connections grid. Free Chrome extension.
- Video counts -> Video Scanner (influencer, brand, and customer counts, plus an open-slot indicator). Free Chrome extension.
- Keyword tools -> brand keyword chips on Creator Connections messages (extension) and the AI Keyword Generator (desktop app, Pro).
- Earnings -> Earnings Intelligence in the desktop app (Pro), plus the web earnings page at influencerbutler.com/dashboard/earnings on every plan.
- Deep links -> Get link, pinned at the top of the extension panel, builds your tagged link and opens the Amazon app on a phone. Free.
- Cross-posting -> Video Reload Butler and YouTube Butler in the desktop app (Pro).
- Mobile -> not yet. Mobile Butler is coming.

The full table, with where to find each one, is on the switch page:
https://www.influencerbutler.com/switch/fluencer-fruit

One more thing. Because Fluencer Fruit closes at the end of the month, we are giving switchers your first six weeks of Pro free, instead of the usual 14-day trial. Everything unlocked, cancel from the dashboard in one click, and no per-message fees anywhere. The offer is on the same page.

Over the next two weeks I will send four short emails walking through each area, starting with product research the day after tomorrow.

Liz Dean
Influencer Butler

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000b-0000-4000-a000-00000000000b', 2, 2,
    'Product research without a research tool subscription',
    'Hi,

It is Liz Dean. Today: the product research side, because it is the part most Fluencer Fruit people used every day, and in Influencer Butler it is free.

Install the Chrome extension (no login, no card), then open any Amazon product page. The panel gives you:

1. Butler Score. A 0 to 100 number with a hover breakdown of where the points came from, next to the Butler Approved seal: actively selling, an open influencer slot in the carousel, in stock, and above your price floor. Each criterion shows pass or fail so you know why.
2. BSR + estimated revenue. It reads the Best Sellers Rank on the page, turns it into estimated monthly units and revenue, and draws a price-history sparkline (plus rank history when the desktop app is paired), so you can see whether a product is climbing or fading.
3. Video Scanner. How many videos are on the product and who made them: influencer, brand, or customer, with an open-slot indicator for the upper carousel. Film where the slot is open.
4. Trend Radar. On Best Sellers, New Releases, and Movers & Shakers, every tile gets its Butler Score, estimated $ per sale, and video count, with a toolbar to sort by what pays.

Nothing here is metered. It reads the page you are already on, one polite request at a time, so Amazon never throttles you.

Get the extension: https://www.influencerbutler.com/extension

And if you missed it, the switch page has the full map and the six-weeks-free offer:
https://www.influencerbutler.com/switch/fluencer-fruit

Next up: campaigns.

Liz Dean
Influencer Butler

P.S. Questions about a specific product? Ask in the free group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000b-0000-4000-a000-00000000000b', 3, 5,
    'Campaign Radar, Last Call, and accepting from the panel',
    'Hi,

It is Liz Dean. If Fluencer Fruit was your campaign finder, this is the email to read.

Open the Creator Connections grid with the extension installed. Every campaign card gets:

- An opportunity score, so the best briefs jump out of the grid.
- Chips for products you already own or have already earned on.
- A fill meter showing how full the campaign is.
- A Last Call watch bell that alerts you before a nearly full campaign closes, so you stop finding out after the fact.

Open a campaign and you get The Butler''s Brief: a verdict, why to take it, what to film, and which product to lead with. Then drop a saved message template into the composer with the placeholders filled in. Templates and AI drafts are unlimited. There is no per-message fee.

When the desktop app is paired, the panel also shows Accept buttons for available Creator Connections and Sponsored Products campaigns and hands the click to the app, which confirms enrollment. And if you would rather not click at all, the Daily Commission Butler in the desktop app looks at what actually sold and accepts the matching campaigns for you.

Everything in the grid is free in the extension. Auto-accept is a Pro butler, which is exactly what the six free weeks are for:
https://www.influencerbutler.com/switch/fluencer-fruit

Next: links and cross-posting.

Liz Dean
Influencer Butler

P.S. Creators share which campaigns are filling fast in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000b-0000-4000-a000-00000000000b', 4, 9,
    'Deep links, 12 marketplaces, and posting one video everywhere',
    'Hi,

It is Liz Dean, with the part that quietly makes the most money: links and reach.

Deep links. Get link sits pinned at the top of the extension panel. One tap builds your own tagged Amazon link for the product on screen, and it opens the Amazon app on a phone so viewers land in the app, not a browser tab. Free, no login. Sign in with your license key and you can also mint branded short links and watch clicks by day, country, device, and surface in the Link Butler ledger. If a product goes unavailable, repoint the same link so old posts keep earning.

Global Maximizer. For the product on screen, one row per marketplace (US, CA, UK, AU, DE, FR, IT, ES, JP, IN, MX, BR) with availability, local price, and an estimated commission per sale, plus a localized affiliate link for each and a copy-all for the whole set. The same video can earn in twelve places.

Cross-posting. In the desktop app, Video Reload Butler republishes your existing videos to 13 marketplaces with translated titles and captions, and YouTube Butler pushes them to YouTube. Film once, post everywhere, without a second afternoon of uploading.

Links and Global Maximizer are free in the extension. The Reload butlers are Pro, and they are unlocked for your first six weeks if you switch this month:
https://www.influencerbutler.com/switch/fluencer-fruit

One more email from me, before Fluencer Fruit closes.

Liz Dean
Influencer Butler

P.S. Come meet other creators in our free group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000b-0000-4000-a000-00000000000b', 5, 13,
    'Fluencer Fruit closes this month',
    'Hi,

It is Liz Dean, last note on this. Fluencer Fruit closes at the end of September, and so does the switch offer.

If you have been reading along, you already know the shape of it:

- Product research, campaigns, video counts, deep links, and Global Maximizer are free in the Chrome extension. No login, no credits, no caps. https://www.influencerbutler.com/extension
- Auto-accept, outreach, Video Reload, YouTube Butler, and Earnings Intelligence live in the desktop app, and every one of them is unlocked for your first six weeks of Pro if you switch before the month ends. Cancel from the dashboard in one click, before the six weeks are up, and you pay nothing.

Claim the six weeks here while the offer is live:
https://www.influencerbutler.com/switch/fluencer-fruit

If you only ever needed the research side, install the extension and you are done. Either way, export anything you want to keep from Fluencer Fruit before it goes; nothing carries over on its own.

Thanks for reading, and welcome over.

Liz Dean
Influencer Butler

P.S. You are always welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
