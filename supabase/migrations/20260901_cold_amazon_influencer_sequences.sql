-- Cold-outreach drip sequences for known Amazon influencers (custom sequences).
--
-- Seeds two tag-triggered sequences for cold leads found by hand on social,
-- people who ALREADY do Amazon influencer work (onsite and offsite: storefronts,
-- Creator Connections, product videos), from the admin Emails > Sequences tab:
--   1. cold-ig-amazon       -> Amazon influencers found on Instagram
--   2. cold-tiktok-amazon   -> Amazon influencers found on TikTok
--
-- The copy is angled at real Amazon creators, not deal posters: it leads with
-- the automations they actually care about (auto-accepting Creator Connections
-- campaigns from their sales, brand outreach on autopilot, and the new Walmart
-- Repost that copies their Amazon storefront to their Walmart Creator
-- storefront), all under the free 14-day Pro trial (no discount code, no card).
-- Since these are cold, unsolicited sends, every step goes through the compliant
-- marketing sender, which appends the one-click unsubscribe and postal-address
-- footer and honors the suppression list. Do not add either to the body copy.
--
-- Both are created PAUSED. Nothing sends until you Activate them in the UI.
-- Auto-enroll fires when a contact is tagged (Contacts tab import, or manual
-- bulk-tag): the tag is normalized to lowercase-hyphen, so typing
-- "cold ig amazon" / "cold tiktok amazon" matches these triggers exactly. For a
-- list you tagged before activating, use Enroll > By tag to backfill.
--
-- Each is throttled to 25 sends/hour (sends_per_hour) so a large pasted list
-- drips slowly and protects the sending domain on a cold audience. Raise it in
-- the editor once bounces stay healthy.
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps) and 20260828_sequence_send_controls.sql (sends_per_hour).
-- Everything is idempotent and safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER those two migrations. If the two sequences were
-- already seeded from an earlier version of this file, the copy is refreshed
-- by 20260902_cold_amazon_influencer_sequences_rewrite.sql (this file's
-- ON CONFLICT DO NOTHING will not overwrite existing rows).

-- ---------------------------------------------------------------------------
-- Sequence 1: Cold Leads: Instagram (Amazon influencers)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, created_by)
VALUES (
  '1a5e0003-0000-4000-a000-000000000003',
  'Cold Leads: Instagram (Amazon influencers)',
  'paused',
  '{"kind":"tag_added","tag":"cold-ig-amazon"}'::jsonb,
  25,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0003-0000-4000-a000-000000000003', 1, 0,
    'You are already doing the Amazon influencer thing on Instagram',
    'Hi,

It is Liz from The Social Media Posse. I came across your Instagram and saw you are already doing the Amazon influencer thing: storefront, tags, the whole setup. That is exactly who we built Influencer Butler for.

Most creators I talk to are leaving money on the table in two spots: brand campaigns they never get around to accepting, and products they have already sold that they never pitch. Influencer Butler runs both for you:

- Amazon Butler reads your real order history, finds the brands behind what you have already sold, and pitches them for Creator Connections campaigns on autopilot.
- Daily Commission Butler looks at what actually sold and auto-accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.

It is a desktop app, and you can try it free for 14 days, no card required.

Start here: https://www.influencerbutler.com/go/download

If it is not for you, no worries at all.

Liz
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 2, 3,
    'The part that works while you sleep',
    'Hi again,

It is Liz. The thing most Amazon creators tell me they hate is the busywork between the money: chasing Creator Connections offers, remembering which brands to pitch, keeping the storefront fed.

Influencer Butler does that on a schedule:

- Daily Commission Butler accepts the right campaigns from your sales every day. Set it and forget it.
- Amazon Butler messages the brands behind your top-selling ASINs for you, so new campaigns keep landing in your inbox.

So your storefront keeps earning on the days you are busy filming, or just living your life.

Your free 14-day trial is right here: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 3, 7,
    'New: your Amazon storefront now copies itself to Walmart',
    'Hi,

Liz here with the update I am most excited about: we just folded Walmart into Influencer Butler.

Walmart Repost takes the videos and photos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when it is the exact same product (matched by barcode). Your Walmart storefront fills itself in, no extra filming or editing. Two income streams from the content you already made.

The rest of the content side runs itself too:

- Orders Butler syncs everything you have bought so it is ready to feature.
- Voiceover Butler writes the scripts for those products.
- Storefront Butler harvests your Amazon storefront so Walmart Repost has content to copy.

The 14-day free trial is still open: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We trade Amazon and Walmart tips daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 4, 14,
    'Last note from me',
    'Hi,

It is Liz, last note from me.

If having your Creator Connections campaigns accepted for you, your brand outreach on autopilot, and your Amazon storefront copied over to Walmart sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep up the great content.

Liz
The Social Media Posse

P.S. Either way, you are welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence 2: Cold Leads: TikTok (Amazon influencers)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, created_by)
VALUES (
  '1a5e0004-0000-4000-a000-000000000004',
  'Cold Leads: TikTok (Amazon influencers)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon"}'::jsonb,
  25,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0004-0000-4000-a000-000000000004', 1, 0,
    'You are already doing the Amazon thing on TikTok',
    'Hi,

It is Liz from The Social Media Posse. I found your TikTok and saw you are already doing the Amazon influencer thing: storefront, product videos, the whole setup. That is exactly who we built Influencer Butler for.

Most creators I talk to are leaving money on the table in two spots: brand campaigns they never get around to accepting, and products they have already sold that they never pitch. Influencer Butler runs both for you:

- Amazon Butler reads your real order history, finds the brands behind what you have already sold, and pitches them for Creator Connections campaigns on autopilot.
- Daily Commission Butler looks at what actually sold and auto-accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.

It is a desktop app, free for 14 days, no card required: https://www.influencerbutler.com/go/download

If it is not for you, no worries at all.

Liz
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 2, 3,
    'The part that works while you sleep',
    'Hi again,

It is Liz. The thing most Amazon creators tell me they hate is the busywork between the money: chasing Creator Connections offers, remembering which brands to pitch, keeping the storefront fed.

Influencer Butler does that on a schedule:

- Daily Commission Butler accepts the right campaigns from your sales every day. Set it and forget it.
- Amazon Butler messages the brands behind your top-selling ASINs for you, so new campaigns keep landing in your inbox.

So your storefront keeps earning on the days you are busy filming.

Free 14-day trial, no card: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 3, 7,
    'New: your Amazon storefront now copies itself to Walmart',
    'Hi,

Liz here with the update I am most excited about: we just folded Walmart into Influencer Butler.

Walmart Repost takes the videos and photos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when it is the exact same product (matched by barcode). Your Walmart storefront fills itself in, no extra filming or editing. Two income streams from the videos you already made.

The rest of the content side runs itself too:

- Orders Butler syncs everything you have bought so it is ready to feature.
- Voiceover Butler writes the scripts for those products.
- Storefront Butler harvests your Amazon storefront so Walmart Repost has content to copy.

The 14-day free trial is still open: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We trade Amazon and Walmart tips daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 4, 14,
    'Last note from me',
    'Hi,

It is Liz, last note from me.

If having your Creator Connections campaigns accepted for you, your brand outreach on autopilot, and your Amazon storefront copied over to Walmart sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep making great videos.

Liz
The Social Media Posse

P.S. Either way, you are welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
