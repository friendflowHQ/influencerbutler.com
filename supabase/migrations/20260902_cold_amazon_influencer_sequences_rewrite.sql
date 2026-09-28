-- Rewrite the copy for the two cold Amazon-influencer sequences.
--
-- The original 20260901_cold_amazon_influencer_sequences.sql seeded these two
-- sequences with deal-poster copy ("finds the day's best Amazon deals worth
-- posting"). The leads we actually harvest are onsite/offsite Amazon influencers
-- (storefronts, Creator Connections, product videos), so this re-angles all
-- eight steps toward what they care about: auto-accepting Creator Connections
-- campaigns from their sales, brand outreach on autopilot, and the new Walmart
-- Repost that copies their Amazon storefront to their Walmart Creator
-- storefront. Every step now also ends with a P.S. inviting them to the free
-- Facebook group.
--
-- The seed uses ON CONFLICT DO NOTHING, so re-running it does NOT touch rows
-- that already exist in prod. This migration UPDATEs the live rows in place,
-- keyed by sequence id + position, and is safe to re-run. Live enrollees keep
-- their progress; only the copy of each step changes.
--
--   cold-ig-amazon      -> 1a5e0003-0000-4000-a000-000000000003
--   cold-tiktok-amazon  -> 1a5e0004-0000-4000-a000-000000000004
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after 20260901_cold_amazon_influencer_sequences.sql.

-- ---------------------------------------------------------------------------
-- Sequence 1: Cold Leads: Instagram (Amazon influencers)
-- ---------------------------------------------------------------------------
UPDATE email_sequence_steps SET
  subject = 'You are already doing the Amazon influencer thing on Instagram',
  body = 'Hi,

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
WHERE sequence_id = '1a5e0003-0000-4000-a000-000000000003' AND position = 1;

UPDATE email_sequence_steps SET
  subject = 'The part that works while you sleep',
  body = 'Hi again,

It is Liz. The thing most Amazon creators tell me they hate is the busywork between the money: chasing Creator Connections offers, remembering which brands to pitch, keeping the storefront fed.

Influencer Butler does that on a schedule:

- Daily Commission Butler accepts the right campaigns from your sales every day. Set it and forget it.
- Amazon Butler messages the brands behind your top-selling ASINs for you, so new campaigns keep landing in your inbox.

So your storefront keeps earning on the days you are busy filming, or just living your life.

Your free 14-day trial is right here: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
WHERE sequence_id = '1a5e0003-0000-4000-a000-000000000003' AND position = 2;

UPDATE email_sequence_steps SET
  subject = 'New: your Amazon storefront now copies itself to Walmart',
  body = 'Hi,

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
WHERE sequence_id = '1a5e0003-0000-4000-a000-000000000003' AND position = 3;

UPDATE email_sequence_steps SET
  subject = 'Last note from me',
  body = 'Hi,

It is Liz, last note from me.

If having your Creator Connections campaigns accepted for you, your brand outreach on autopilot, and your Amazon storefront copied over to Walmart sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep up the great content.

Liz
The Social Media Posse

P.S. Either way, you are welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
WHERE sequence_id = '1a5e0003-0000-4000-a000-000000000003' AND position = 4;

-- ---------------------------------------------------------------------------
-- Sequence 2: Cold Leads: TikTok (Amazon influencers)
-- ---------------------------------------------------------------------------
UPDATE email_sequence_steps SET
  subject = 'You are already doing the Amazon thing on TikTok',
  body = 'Hi,

It is Liz from The Social Media Posse. I found your TikTok and saw you are already doing the Amazon influencer thing: storefront, product videos, the whole setup. That is exactly who we built Influencer Butler for.

Most creators I talk to are leaving money on the table in two spots: brand campaigns they never get around to accepting, and products they have already sold that they never pitch. Influencer Butler runs both for you:

- Amazon Butler reads your real order history, finds the brands behind what you have already sold, and pitches them for Creator Connections campaigns on autopilot.
- Daily Commission Butler looks at what actually sold and auto-accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.

It is a desktop app, free for 14 days, no card required: https://www.influencerbutler.com/go/download

If it is not for you, no worries at all.

Liz
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
WHERE sequence_id = '1a5e0004-0000-4000-a000-000000000004' AND position = 1;

UPDATE email_sequence_steps SET
  subject = 'The part that works while you sleep',
  body = 'Hi again,

It is Liz. The thing most Amazon creators tell me they hate is the busywork between the money: chasing Creator Connections offers, remembering which brands to pitch, keeping the storefront fed.

Influencer Butler does that on a schedule:

- Daily Commission Butler accepts the right campaigns from your sales every day. Set it and forget it.
- Amazon Butler messages the brands behind your top-selling ASINs for you, so new campaigns keep landing in your inbox.

So your storefront keeps earning on the days you are busy filming.

Free 14-day trial, no card: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
WHERE sequence_id = '1a5e0004-0000-4000-a000-000000000004' AND position = 2;

UPDATE email_sequence_steps SET
  subject = 'New: your Amazon storefront now copies itself to Walmart',
  body = 'Hi,

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
WHERE sequence_id = '1a5e0004-0000-4000-a000-000000000004' AND position = 3;

UPDATE email_sequence_steps SET
  subject = 'Last note from me',
  body = 'Hi,

It is Liz, last note from me.

If having your Creator Connections campaigns accepted for you, your brand outreach on autopilot, and your Amazon storefront copied over to Walmart sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep making great videos.

Liz
The Social Media Posse

P.S. Either way, you are welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
WHERE sequence_id = '1a5e0004-0000-4000-a000-000000000004' AND position = 4;
