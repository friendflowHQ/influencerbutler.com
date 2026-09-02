-- Grow Together Creator Bundle: contributor onboarding + reader nurture drips.
--
-- Two sequences for the NEW bundle Influencer Butler is running (distinct from
-- the 2020 Live Sweet re-engagement drip in 20260904_live_sweet_bundle_sequences.sql):
--
--   1. Contributor onboarding  (tag_added: bundle-contributor)
--      Fires when a creator applies at /grow-together (the apply route tags them
--      bundle-contributor). Confirms their topic, the deadline, and exactly what
--      to send, then nudges them to submit.
--
--   2. Reader nurture           (source: grow-together-bundle)
--      Fires for everyone who downloads the finished PDF (email_subscribers.source
--      = grow-together-bundle). Walks them from the free course to the app trial.
--
-- Date-specific, roster-wide coordination (2-weeks-left, launch-week promo assets,
-- post-launch "here is the shared list") is NOT modeled here: those are one-off
-- campaigns the admin sends to the bundle-contributor segment from the Emails UI
-- when the calendar hits, since sequence steps count days from enrollment, not
-- from a fixed launch date. Draft copy for them lives in the bundle playbook doc.
--
-- Both created PAUSED. Activate the contributor sequence before recruiting, and
-- the reader sequence before launch (tag_added / source enroll only fires for
-- ACTIVE sequences). For anyone tagged before activation, use Enroll > By tag /
-- By source to backfill.
--
-- Throttled 25/hour, send_hour 9 (America/Denver), track_opens true. Sent via the
-- compliant marketing sender (one-click unsubscribe + postal footer auto-appended,
-- suppression honored). Do not add either to the body copy.
--
-- Key dates referenced in copy (keep in sync with src/app/grow-together/_data/bundleMeta.ts):
--   submission deadline: October 3, 2026
--   launch week:         October 13-17, 2026
--
-- Depends on 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql,
-- 20260831_sequence_send_hour.sql, 20260902_sequence_track_opens.sql.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into the
-- Supabase SQL editor AFTER those migrations. Idempotent (ON CONFLICT DO NOTHING);
-- revise copy later via a separate _rewrite.sql that UPDATEs by sequence_id + position.

-- ---------------------------------------------------------------------------
-- Sequence 1: Contributor onboarding (tag_added: bundle-contributor)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '2b7e0001-0000-4000-a000-000000000001',
  'Grow Together: Contributor onboarding',
  'paused',
  '{"kind":"tag_added","tag":"bundle-contributor"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '2b7e0001-0000-4000-a000-000000000001', 1, 0,
    'You are in the Grow Together Creator Bundle',
    'Hi,

It is Liz Dean. Thank you so much for joining the Grow Together Creator Bundle. This is going to be a fun one.

Everything is submitted right here, no Google Docs to chase, no email attachments. This is your private submission page (only you can use this link):
{{BUNDLE_SUBMIT_URL}}

Here is what to fill in when you get a chance:

1. Your name and the social handles you want printed with your chapter.
2. A photo of you or your logo.
3. A short intro: how you make money in the online world, what inspired you to go down this path, and what you love most about what you do.
4. Your chapter: expand on the topic you claimed, in your own voice. A few paragraphs of your real, practical advice is perfect.
5. To close it out, pick ONE of these and answer it:
   - What is one thing you wish you had known when you were starting out?
   - What is the biggest challenge you face when it comes to online growth?
   - One tip you would give to anyone wanting to grow their online presence.

Deadline: October 3, 2026. You can save and edit any time before then using the same link.

During launch week, October 13 to 17, we all share the finished bundle with our audiences on the same days. I will send you graphics and ready-to-use captions ahead of time so it is copy, paste, done. Your reward: everyone who downloads the bundle knows their email is shared with the contributing creators, and after launch I send you that list.

Any questions at all, just reply. I read every message.

Liz Dean
The Social Media Posse

P.S. If you are not already in our free creator group, come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '2b7e0001-0000-4000-a000-000000000001', 2, 3,
    'A few tips for a chapter people will love',
    'Hi,

It is Liz Dean again with a few things that make a bundle chapter really land:

- Lead with your best, most specific tip. Skip the long intro.
- Write like you talk. Examples from your own account are gold.
- One clear takeaway beats ten vague ones. What is the one thing you wish someone had told you?
- Fill in the handles and one link so readers can follow you.

When you are ready, everything goes on your private submission page (save and edit any time):
{{BUNDLE_SUBMIT_URL}}

Deadline is October 3, 2026. Submitting early is very welcome and makes launch week calm for everyone.

Reply any time if you want me to look at a draft or bounce around an angle.

Liz Dean
The Social Media Posse'
  ),
  (
    '2b7e0001-0000-4000-a000-000000000001', 3, 7,
    'How is your chapter coming along?',
    'Hi,

It is Liz Dean, just checking in. How is your chapter coming?

No pressure at all, I only want to make sure you have everything you need. If you are stuck on where to start, just reply and I will send you a simple outline to fill in.

When you are ready, your private submission page is here:
{{BUNDLE_SUBMIT_URL}}

Quick recap:
- Due October 3, 2026
- A few paragraphs on your topic, in your voice, plus a photo and a short intro
- Everything goes on your submission page above, editable any time

Thank you for being part of this. It is going to be a beautiful guide because of creators like you.

Liz Dean
The Social Media Posse'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence 2: Reader nurture (source: grow-together-bundle)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '2b7e0002-0000-4000-a000-000000000002',
  'Grow Together: Reader nurture',
  'paused',
  '{"kind":"source","source":"grow-together-bundle"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '2b7e0002-0000-4000-a000-000000000002', 1, 0,
    'Your Grow Together bundle (plus a free course)',
    'Hi,

It is Liz Dean. Thank you for grabbing the Grow Together Creator Bundle. I hope the chapters give you a few ideas you can use this week.

If you want to go deeper on turning an audience into Amazon commissions, I made a completely free course on exactly that. No sign-up, no card, and your progress saves in your browser:

https://www.influencerbutler.com/course/amazon-influencer

Start with the chapter in the bundle that spoke to you most, then let the course fill in the rest.

Liz Dean
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come join us: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '2b7e0002-0000-4000-a000-000000000002', 2, 3,
    'The boring parts, done for you',
    'Hi,

It is Liz Dean. The creators who earn from Amazon are rarely the ones with the most followers. They are the ones who follow through on the tedious parts: setting up the storefront, accepting the right brand campaigns, and pitching the brands they already sell.

I built Influencer Butler to do those for you:

- Daily Commission Butler looks at what actually sold and accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.
- Amazon Butler finds the brands behind what you have already sold and pitches them for new campaigns on autopilot.

It is a desktop app, free for 14 days, no card:
https://www.influencerbutler.com/go/download?src=growtogether

Liz Dean
The Social Media Posse'
  ),
  (
    '2b7e0002-0000-4000-a000-000000000002', 3, 6,
    'Two storefronts from the same content',
    'Hi,

It is Liz Dean with the update I am most excited about. If you post to an Amazon storefront, you can now earn from Walmart too, from the same content.

Walmart Repost takes the videos and photos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when it is the exact same product (matched by barcode). Two income streams from content you already made, with no extra filming.

The getting-started walkthrough makes setup quick:
https://www.influencerbutler.com/help/tutorials/getting-started-influencer-butler

Or jump straight into the free trial: https://www.influencerbutler.com/go/download?src=growtogether

Liz Dean
The Social Media Posse'
  ),
  (
    '2b7e0002-0000-4000-a000-000000000002', 4, 10,
    'How creators are actually using this',
    'Hi,

It is Liz Dean. A few ways creators are using Influencer Butler right now:

- Letting the app accept the Creator Connections campaigns that match their real sales, so nothing is left on the table.
- Turning products they already promote into ready-to-post captions in minutes.
- Copying their Amazon storefront over to Walmart for a second income stream.

If any of that sounds useful, your free 14-day trial is right here, no card:
https://www.influencerbutler.com/go/download?src=growtogether

Prefer to start with zero setup? The free course covers the simplest way in: https://www.influencerbutler.com/course/amazon-influencer

Liz Dean
The Social Media Posse'
  ),
  (
    '2b7e0002-0000-4000-a000-000000000002', 5, 14,
    'Last note from me',
    'Hi,

It is Liz Dean, last note on this one. If turning your audience into Amazon and Walmart commissions sounds worth an afternoon, here is everything in one place:

- The free course, start to finish: https://www.influencerbutler.com/course/amazon-influencer
- The app, free for 14 days, no card: https://www.influencerbutler.com/go/download?src=growtogether

Set it up once and the campaigns, outreach, and Walmart crossposting keep running while you make content.

Thank you again for being part of the Grow Together bundle. Keep up the great work.

Liz Dean
The Social Media Posse

P.S. You are always welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
