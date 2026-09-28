-- Dani Austin giveaway: Amazon side-hustle nurture with a self-select branch.
--
-- Seeds three tag-triggered sequences for the ~40k lukewarm subscribers from the
-- Dani Austin giveaway (people who like free things, mostly brand new to
-- affiliate marketing, want an at-home side hustle):
--   1. dani-austin-giveaway  -> Welcome: deliver the free course, then a fork
--   2. ib-beginner           -> Beginner: start a Facebook deals group (how-to)
--   3. ib-creator            -> Creator: turn an existing following into commissions
--
-- THE BRANCH. The welcome sequence (step 2 and 3) carries {{PATH_BEGINNER_URL}}
-- and {{PATH_CREATOR_URL}} placeholders. The email-marketing cron replaces them
-- with per-recipient signed links at send time (src/lib/email-path-select.ts).
-- Clicking one hits GET /api/email/path, which tags the reader ib-beginner or
-- ib-creator (auto-enrolling them into the matching branch below) and cancels
-- their welcome enrollment so they are not double-dripped. That branch code must
-- be deployed BEFORE these send, or the fork links will not resolve.
--
-- All three are created PAUSED. Nothing sends until you Activate them in the UI.
-- Auto-enroll fires when a contact is tagged (Contacts import, bulk-tag, or the
-- branch click); the tag is normalized to lowercase-hyphen. Because
-- enrollForTagAdded only enrolls into ACTIVE sequences, ACTIVATE ALL THREE
-- BEFORE tagging the list, and before anyone can click a fork link. For a list
-- tagged before activation, use Enroll > By tag to backfill the welcome.
--
-- Each is throttled to 25 sends/hour (sends_per_hour) so the 40k list drips
-- slowly and protects the sending domain on a lukewarm audience. Raise it in the
-- editor once bounces stay healthy. send_hour = 9 pins sends to 9am America/Denver.
-- track_opens = true so Resend records opens/clicks (adds a minimal HTML body).
--
-- Since these are sent to a giveaway list (not people who opted into Influencer
-- Butler), every step goes through the compliant marketing sender, which appends
-- the one-click unsubscribe and postal-address footer and honors the suppression
-- list. Do not add either to the body copy. Step 1 of the welcome re-introduces
-- who we are and why they are hearing from us.
--
-- Depends on 20260817_email_marketing.sql (email_sequences / _steps),
-- 20260828_sequence_send_controls.sql (sends_per_hour), 20260831_sequence_send_hour.sql
-- (send_hour), and 20260902_sequence_track_opens.sql (track_opens).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER those migrations. Everything is idempotent
-- (ON CONFLICT DO NOTHING); to revise copy later, add a separate _rewrite.sql
-- that UPDATEs by sequence_id + position (this file will not overwrite live rows).

-- ---------------------------------------------------------------------------
-- Sequence W: Welcome (Dani Austin giveaway) -> free course + self-select fork
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e0006-0000-4000-a000-000000000006',
  'Dani Austin: Welcome + course + fork',
  'paused',
  '{"kind":"tag_added","tag":"dani-austin-giveaway"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0006-0000-4000-a000-000000000006', 1, 0,
    'Your free Amazon influencer course (thanks for entering the giveaway)',
    'Hi,

It is Liz from The Social Media Posse. You entered the Dani Austin giveaway and joined our list, so I wanted to send you something genuinely useful, no strings attached.

If you have ever thought about making a little money from home, being an Amazon affiliate is one of the easiest ways to start. You share products you already like, and you earn a commission when people buy. No inventory, no shipping, no showing your face if you do not want to.

I put together a full course that walks you through it from zero, and it is completely free. No sign-up, no card, and your progress saves in your browser:

https://www.influencerbutler.com/course/amazon-influencer

Start with module one today. It takes about ten minutes.

Liz
The Social Media Posse

P.S. We run a free group for new Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0006-0000-4000-a000-000000000006', 2, 2,
    'Quick question: which one are you?',
    'Hi,

It is Liz again. To point you at the right next step, it helps to know where you are starting from. Most people who join us are one of two types.

If you are starting from scratch with no following, the easiest way to earn is to start a simple Amazon deals group on Facebook and post daily deals. I will walk you through the whole thing, one step at a time. Pick this one:
{{PATH_BEGINNER_URL}}

If you already have an audience (roughly 1000 followers or more on any platform), you can turn that audience into Amazon commissions much faster. Pick this one:
{{PATH_CREATOR_URL}}

Not sure? Go with the first one. Starting from zero is the path most people here take, and it works.

Either way, the free course is always here: https://www.influencerbutler.com/course/amazon-influencer

Liz
The Social Media Posse

P.S. Our free creator group is a good place to ask questions: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0006-0000-4000-a000-000000000006', 3, 5,
    'Starting from scratch is the easier one, honestly',
    'Hi,

It is Liz. If you have not picked a path yet, let me make it simple: you do not need a following, a camera, or any experience to start earning as an Amazon affiliate.

The lowest-effort way in is a Facebook deals group. You post good Amazon deals, people click and buy, and you earn a commission. An app can even find the deals and post them for you. Here is that path:
{{PATH_BEGINNER_URL}}

If you would rather just look around for free first, our Chrome extension shows you which products are actually worth promoting, right on the Amazon pages you already browse:
https://www.influencerbutler.com/extension

And the free course covers all of it: https://www.influencerbutler.com/course/amazon-influencer

Liz
The Social Media Posse

P.S. Come meet other people starting out in our free group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence B: Beginner -> start a Facebook deals group (how-to over the days)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e0007-0000-4000-a000-000000000007',
  'Dani Austin: Beginner (Facebook deals group)',
  'paused',
  '{"kind":"tag_added","tag":"ib-beginner"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0007-0000-4000-a000-000000000007', 1, 0,
    'You do not need a single follower to start',
    'Hi,

It is Liz. Great choice. Here is the honest truth: you do not need to be an influencer to make money as an Amazon affiliate. Plenty of people earn steadily by running a simple Facebook deals group and never showing their face.

Here is the whole plan. I will send one step every couple of days so it never feels like too much:

- Step 1: get approved for Amazon and set up your account.
- Step 2: create your Facebook deals group.
- Step 3: let an app find and post the deals for you.
- Step 4: grow the group on autopilot.

That is it. No filming, no ads, no inventory.

Want to read ahead? The free course covers every step in detail: https://www.influencerbutler.com/course/amazon-influencer

Talk soon.

Liz
The Social Media Posse

P.S. Meet other new deal posters in our free group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0007-0000-4000-a000-000000000007', 2, 2,
    'Step 1: get approved and set up (about 30 minutes)',
    'Hi,

It is Liz with your first step: getting set up. This is the part people overthink, so I will keep it simple.

- Sign up for the Amazon Associates program. It is free, and you get a tracking ID that turns any Amazon link into your affiliate link.
- Save your storefront link somewhere handy. Every deal you post will use your link so you get credit for the sale.

I wrote a plain-English walkthrough of how to start a deals account from scratch here:
https://www.influencerbutler.com/blog/how-to-start-a-deals-account

Do just this today. Once you are approved, we build your group.

Liz
The Social Media Posse

P.S. Stuck on approval? Ask in the group, someone has been there: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0007-0000-4000-a000-000000000007', 3, 4,
    'Step 2: spin up your Facebook deals group',
    'Hi,

It is Liz. Time for the fun part: your own Facebook deals group. This is where your deals live and where your audience grows.

You can do it by hand, or you can let Influencer Butler set it up for you. It plans a niche, writes the group name, description, and welcome post, and gets it ready to fill with deals. Here is the walkthrough:
https://www.influencerbutler.com/help/tutorials/facebook-group-builder

Keep the group focused on a theme (home finds, kitchen gadgets, deals for moms) so it is easy to grow. Name it, set it to public, and post one deal to start.

Next step, I will show you how to stop posting deals by hand.

Liz
The Social Media Posse

P.S. Share your new group in ours and we will cheer you on: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0007-0000-4000-a000-000000000007', 4, 7,
    'Step 3: let the app post the deals for you',
    'Hi,

It is Liz. Posting deals by hand gets old fast. This is where it becomes a real side hustle instead of a second job.

The Deals Butler finds the best Amazon deals every day, turns them into your affiliate links automatically, and posts them to your group on a schedule. You set it once and it runs while you live your life.

It is a desktop app, and you can try the full version free for 14 days, no card required:
https://www.influencerbutler.com/go/download?src=danibeginner

If you would rather see how it works first, the free course has a full lesson on it: https://www.influencerbutler.com/course/amazon-influencer

Liz
The Social Media Posse

P.S. We trade the best deal sources daily in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0007-0000-4000-a000-000000000007', 5, 10,
    'Step 4: grow it on autopilot',
    'Hi,

It is Liz with the last building block: growth. A deals group earns more as it grows, and you do not have to grow it by hand.

Two easy moves:

- Post your deals to more than one place at once. The same app can auto-post to Facebook, Telegram, and Reddit so more people see them. Here is how: https://www.influencerbutler.com/blog/auto-post-daily-deals-facebook-telegram-reddit
- Invite people who react to your posts to join the group, so every good deal grows your audience.

Do a little of this each week and it compounds.

Liz
The Social Media Posse

P.S. Want feedback on your group? Post it in ours: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0007-0000-4000-a000-000000000007', 6, 14,
    'Your side hustle, recapped',
    'Hi,

It is Liz. You now have the whole playbook:

- You are approved and set up as an Amazon affiliate.
- You have a Facebook deals group.
- An app finds and posts the deals for you.
- Your group grows on autopilot.

If you have not set up the app yet, that is the piece that saves you the most time. Start the free 14-day trial here:
https://www.influencerbutler.com/go/download?src=danibeginner

And if you ever want a refresher, the getting-started walkthrough is here:
https://www.influencerbutler.com/help/tutorials/getting-started-influencer-butler

You have got this. Reply any time if you get stuck.

Liz
The Social Media Posse

P.S. Come tell us about your first sale in the group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence C: Creator -> turn an existing following into Amazon commissions
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e0008-0000-4000-a000-000000000008',
  'Dani Austin: Creator (leverage your following)',
  'paused',
  '{"kind":"tag_added","tag":"ib-creator"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0008-0000-4000-a000-000000000008', 1, 0,
    'You already did the hard part',
    'Hi,

It is Liz. If you already have an audience, you are ahead of almost everyone. The hard part, getting people to follow you, is done. Now it is about turning that attention into Amazon commissions.

Here is the short version: set up your Amazon storefront, share products your audience already trusts you on, and let the boring parts run themselves. I will show you how over the next couple of weeks.

Start with the free course. It is built for exactly this and takes nothing to begin:
https://www.influencerbutler.com/course/amazon-influencer

More soon.

Liz
The Social Media Posse

P.S. Our free creator group is full of people doing this now: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0008-0000-4000-a000-000000000008', 2, 3,
    'Set it up once, let it run',
    'Hi,

It is Liz. The thing that separates creators who earn from Amazon and those who do not is usually not talent. It is follow-through on the boring parts: accepting brand campaigns, keeping the storefront fed, and pitching the brands you already sell.

Influencer Butler does those for you:

- Daily Commission Butler looks at what actually sold and accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.
- Amazon Butler finds the brands behind what you have already sold and pitches them for new campaigns on autopilot.

It is a desktop app, free for 14 days, no card:
https://www.influencerbutler.com/go/download?src=danicreator

Liz
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0008-0000-4000-a000-000000000008', 3, 7,
    'Two storefronts from the content you already make',
    'Hi,

It is Liz with the update I am most excited about. If you post to an Amazon storefront, you can now earn from Walmart too, from the same content.

Walmart Repost takes the videos and photos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when it is the exact same product (matched by barcode). Two income streams from content you already made, with no extra filming.

If you have not set the app up yet, the getting-started walkthrough makes it quick:
https://www.influencerbutler.com/help/tutorials/getting-started-influencer-butler

Or jump straight into the free trial: https://www.influencerbutler.com/go/download?src=danicreator

Liz
The Social Media Posse

P.S. We share what is working on both platforms in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0008-0000-4000-a000-000000000008', 4, 14,
    'Last note from me',
    'Hi,

It is Liz, last note on this. If turning your audience into Amazon commissions sounds worth an afternoon, here is everything in one place:

- The free course, start to finish: https://www.influencerbutler.com/course/amazon-influencer
- The app, free for 14 days, no card: https://www.influencerbutler.com/go/download?src=danicreator

Set it up once and the campaigns, outreach, and Walmart crossposting keep running while you make content.

Either way, keep up the great work.

Liz
The Social Media Posse

P.S. You are always welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
