-- A/B/C opener test for cold TikTok Amazon influencers (three variant sequences).
--
-- The live sequence cold-tiktok-amazon (Cold Leads: TikTok (Amazon influencers))
-- opens well but leaks on click -> convert. This seeds three independent 4-step
-- funnels so we can split fresh cold TikTok leads three ways and read a winner
-- from real numbers. Each tests a different hypothesis about why the opener does
-- not convert:
--   A (cold-tiktok-amazon-a)  Short: one benefit, one link, keeps the winning
--                             subject so only the body changes.
--   B (cold-tiktok-amazon-b)  Proof: mechanism-led ("your order history is a
--                             brand list") + light social proof, new subjects.
--   C (cold-tiktok-amazon-c)  Low-friction: step 1 asks for a reply, not a
--                             download; escalates to the trial in later steps.
--
-- The original cold-tiktok-amazon sequence is left untouched and keeps running
-- for its current enrollees. Do NOT also tag these leads cold-tiktok-amazon, or
-- they would double-enroll into the original.
--
-- Same 0/3/7/14 day cadence as the original. Since these are cold, unsolicited
-- sends, every step goes through the compliant marketing sender, which appends
-- the one-click unsubscribe and postal-address footer and honors the suppression
-- list. Do not add either to the body copy.
--
-- All three are created PAUSED. Activate them in Emails > Sequences BEFORE
-- tagging leads (cold sequences: activate first, then tag), and split each new
-- batch of leads into even thirds across the -a / -b / -c tags. The tag is
-- normalized to lowercase-hyphen. For a list tagged before activating, use
-- Enroll > By tag to backfill.
--
-- Throttled to 150 sends/hour to match the live cold-tiktok drip. track_opens is
-- true so Resend records opens/clicks (adds a minimal HTML body), which the
-- test relies on. send_hour is left unset so it drips continuously like the
-- original, rather than batching once daily.
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps), 20260828_sequence_send_controls.sql (sends_per_hour),
-- and 20260902_sequence_track_opens.sql (track_opens). Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after those migrations.

-- ---------------------------------------------------------------------------
-- Variant A: Cold Leads: TikTok Amazon (A: Short)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e0004-0000-4000-a000-00000000000a',
  'Cold Leads: TikTok Amazon (A: Short)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-a"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0004-0000-4000-a000-00000000000a', 1, 0,
    'You are already doing the Amazon thing on TikTok',
    'Hi,

It is Liz from The Social Media Posse. I saw your TikTok and the Amazon storefront behind it, so this will be quick.

There is one thing almost every Amazon creator I meet is losing money on: Creator Connections campaigns that match products they have already sold, sitting unaccepted.

Influencer Butler watches what actually sells on your storefront and accepts the matching campaigns for you, every day, automatically. The best-seller you posted last week does not sit there with an open campaign you forgot to claim.

That is the whole pitch. It is free for 14 days, no card:
https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000a', 2, 3,
    'The campaign you already qualified for',
    'Hi again, it is Liz.

Quick example of what I meant. Say a product on your storefront sold well this month and the brand has an open Creator Connections campaign. Most creators never see the match, so they never accept it and never get paid for it.

Influencer Butler''s Daily Commission Butler checks your sales against open campaigns every day and accepts the ones that match. You keep filming; it keeps claiming.

Free 14-day trial, no card: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000a', 3, 7,
    'New: your Amazon storefront now copies itself to Walmart',
    'Hi, Liz here with the update I am most excited about.

We just folded Walmart into Influencer Butler. Walmart Repost takes the videos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, but only when it is the exact same product, matched by barcode.

Same videos you already filmed, a second storefront earning. No extra editing.

The 14-day free trial covers all of it: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We trade Amazon and Walmart tips daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000a', 4, 14,
    'Last note from me',
    'Hi, it is Liz, last note from me.

If having your matching Creator Connections campaigns accepted for you, and your Amazon storefront copied over to Walmart, sounds useful, the free 14-day trial is right here:
https://www.influencerbutler.com/go/download

If not, no hard feelings. Either way, keep making great videos.

Liz
The Social Media Posse

P.S. You are welcome in our free creator group either way: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Variant B: Cold Leads: TikTok Amazon (B: Proof)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e0004-0000-4000-a000-00000000000b',
  'Cold Leads: TikTok Amazon (B: Proof)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-b"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0004-0000-4000-a000-00000000000b', 1, 0,
    'Your Amazon order history is a brand list',
    'Hi,

It is Liz from The Social Media Posse. I will get to the point.

Every product you have already sold on Amazon has a brand behind it, and most of those brands run Creator Connections campaigns. Your order history is basically a list of brands who already have a reason to pay you.

Nobody works that list, because pulling it by hand is miserable. So Influencer Butler does it: Amazon Butler reads your real order history, finds the brands behind your top sellers, and pitches them for campaigns for you.

It is a desktop app the Amazon and Walmart creators in our group use daily. Free for 14 days, no card:
https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. That free group is here if you want to see what they are running: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000b', 2, 3,
    'The two piles of money most creators skip',
    'Hi again, it is Liz.

When I look at an Amazon creator''s setup, the missed money is almost always in the same two piles:

1. Products they already sold, whose brands they never pitched.
2. Creator Connections campaigns that matched their sales, that they never accepted.

Influencer Butler works both piles on a schedule. Amazon Butler pitches the brands; Daily Commission Butler accepts the matching campaigns off your real sales. You do not have to remember any of it.

Free 14-day trial, no card: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. Free Amazon and Walmart creator community: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000b', 3, 7,
    'New: your Amazon storefront now copies itself to Walmart',
    'Hi, Liz here.

Newest piece: Walmart. Walmart Repost takes the videos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when the barcode is an exact match, so it is genuinely the same product.

The creators using it are getting a second commission stream out of videos they already filmed. Nothing new to shoot.

Same 14-day free trial: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We break down Walmart Creator daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000b', 4, 14,
    'Closing the loop',
    'Hi, it is Liz, last one from me.

To recap what Influencer Butler does off your existing Amazon setup: pitches the brands behind what you have sold, accepts the campaigns that match your sales, and copies your storefront over to Walmart. All from the order history and videos you already have.

Free 14 days, no card, if you want to see it on your own account:
https://www.influencerbutler.com/go/download

Either way, thanks for reading. Keep making great videos.

Liz
The Social Media Posse

P.S. The group is open to you regardless: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Variant C: Cold Leads: TikTok Amazon (C: Low-friction)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e0004-0000-4000-a000-00000000000c',
  'Cold Leads: TikTok Amazon (C: Low-friction)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-c"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0004-0000-4000-a000-00000000000c', 1, 0,
    'Quick one about your TikTok storefront',
    'Hi,

It is Liz from The Social Media Posse. Real quick, no pitch in this one.

I saw your TikTok and your Amazon storefront and I think you are leaving two easy commission streams on the table: brand campaigns that match what you have already sold, and products you never circled back to pitch.

I put together a 60-second rundown of how creators are automating both. Want me to send it over? Just reply "TikTok" and I will fire it back.

Liz
The Social Media Posse

P.S. We also run a free group for Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000c', 2, 3,
    'Here is the 60-second version',
    'Hi again, it is Liz. Here is the short version I mentioned, no reply needed.

Influencer Butler is a desktop app that does two jobs off your existing Amazon account:

- Accepts the Creator Connections campaigns that match what you have actually sold, every day, so you stop missing them.
- Finds the brands behind your best sellers and pitches them for you.

If you would rather just see it than read about it, it is free for 14 days with no card:
https://www.influencerbutler.com/go/download

No worries if the timing is off.

Liz
The Social Media Posse

P.S. Free Amazon and Walmart creator group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000c', 3, 7,
    'New: your Amazon storefront now copies itself to Walmart',
    'Hi, Liz here with one new thing worth 30 seconds.

Influencer Butler now copies your Amazon storefront to Walmart. Walmart Repost republishes the videos already on your Amazon storefront to your Walmart Creator storefront automatically, only when it is the exact same product by barcode.

Second storefront, same videos, no extra filming. If you want to try it on your own account it is still free for 14 days:
https://www.influencerbutler.com/go/download

Liz
The Social Media Posse

P.S. We talk Walmart Creator daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0004-0000-4000-a000-00000000000c', 4, 14,
    'Want me to stop here?',
    'Hi, it is Liz.

I have sent a few notes and do not want to crowd your inbox, so this is my last one.

If automating your Creator Connections campaigns and copying your storefront to Walmart sounds worth 14 free days, it is right here:
https://www.influencerbutler.com/go/download

And if not, just ignore this and I will leave your inbox alone. Either way, keep making great videos.

Liz
The Social Media Posse

P.S. The free creator group stays open to you: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
