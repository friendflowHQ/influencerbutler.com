-- Live Sweet "Girls Grow Together" bundle: re-engagement-gated Amazon funnel.
--
-- Seeds two tag-triggered sequences for the list from the Live Sweet "Girls Grow
-- Together Guide" bundle (October 2020, liveSweetandprosper.com, by Lindsey
-- Bonnice / @livesweet). The audience is female Instagram influencers, bloggers,
-- and small-shop owners: social-media people who already have an audience. Liz
-- Dean (@lizdean) contributed the Instagram-automation chapter to that bundle, so
-- the intro reconnects authentically.
--   1. live-sweet-bundle  -> Gate: reconnect + free course + one-click opt back in
--   2. live-sweet-yes     -> Engaged funnel (only people who clicked the gate)
--
-- WHY GATED. This list is ~6 years old (Podia export dated 2020-12-03). Mailing a
-- stale list risks bounces/complaints that damage the sending domain. The engine
-- drips on a schedule (not on opens), so the gate is a SEPARATE short sequence:
-- the whole list gets the gate, but only people who CLICK the opt-in link
-- ({{LIVE_SWEET_YES_URL}}, a signed /api/email/path?p=livesweet link personalized
-- by the cron) get tagged live-sweet-yes and enrolled into the full funnel. Dead
-- addresses receive at most 2 gate emails. Clicking also cancels the gate
-- enrollment (see src/lib/email-path-select.ts LIVE_SWEET_WELCOME_SEQUENCE_ID).
-- STRONGLY recommended: validate/clean the list (external bounce-check) before import.
--
-- The branch code (src/lib/email-path-select.ts, /api/email/path) must be DEPLOYED
-- before these send, or the opt-in link will not resolve.
--
-- Both are created PAUSED. Nothing sends until you Activate them in the UI.
-- ACTIVATE BOTH BEFORE TAGGING: the gate must be active to enroll the list, and
-- the engaged funnel must be active before anyone clicks the gate (enrollForTagAdded
-- only enrolls ACTIVE sequences). For a list tagged before activation, use
-- Enroll > By tag to backfill the gate.
--
-- Throttled to 25 sends/hour, send_hour = 9 (America/Denver), track_opens = true.
-- Sent via the compliant marketing sender (one-click unsubscribe + postal footer
-- auto-appended, suppression honored). Do not add either to the body copy.
--
-- Depends on 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql,
-- 20260831_sequence_send_hour.sql, 20260902_sequence_track_opens.sql.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER those migrations. Idempotent (ON CONFLICT DO
-- NOTHING); revise copy later via a separate _rewrite.sql that UPDATEs by
-- sequence_id + position.

-- ---------------------------------------------------------------------------
-- Sequence 1: Gate (reconnect + opt back in). Whole list, deliberately short.
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e0009-0000-4000-a000-000000000009',
  'Live Sweet: Gate (reconnect + opt-in)',
  'paused',
  '{"kind":"tag_added","tag":"live-sweet-bundle"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0009-0000-4000-a000-000000000009', 1, 0,
    'It has been a while (from the Girls Grow Together bundle)',
    'Hi,

It is Liz Dean. Back in 2020 I wrote the chapter on using automation for your Instagram account in the Girls Grow Together bundle from Live Sweet. You grabbed that bundle, which is why you are hearing from me now.

A lot has changed since then. I built a tool called Influencer Butler that does the tedious parts of creator work for you, and I put together a completely free course on making money as an Amazon affiliate. No sign-up, no card, and your progress saves in your browser:

https://www.influencerbutler.com/course/amazon-influencer

If you are still building an audience and want the current playbook for turning it into Amazon commissions, I would love to send it to you. Click here and I will send the step-by-step plan:
{{LIVE_SWEET_YES_URL}}

If not, no worries, I will not clutter your inbox.

Liz Dean
The Social Media Posse

P.S. We run a free group for Amazon and Walmart creators. Come say hi: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e0009-0000-4000-a000-000000000009', 2, 3,
    'Still want the Amazon side-hustle plan?',
    'Hi,

It is Liz Dean again, following up once. If the timing is right, I will send you the current step-by-step plan for turning your audience into Amazon commissions. Click here and it is yours:
{{LIVE_SWEET_YES_URL}}

Either way, the free Amazon affiliate course is open to you, no strings attached:
https://www.influencerbutler.com/course/amazon-influencer

If this is not for you right now, you can ignore this and you will not hear from me about it again.

Liz Dean
The Social Media Posse

P.S. Our free creator group is a good place to ask questions: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence 2: Engaged funnel (only people who clicked the gate opt-in)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, send_hour, track_opens, created_by)
VALUES (
  '1a5e000a-0000-4000-a000-00000000000a',
  'Live Sweet: Engaged funnel',
  'paused',
  '{"kind":"tag_added","tag":"live-sweet-yes"}'::jsonb,
  25,
  9,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e000a-0000-4000-a000-00000000000a', 1, 0,
    'You are in: the fastest path for someone who already has an audience',
    'Hi,

It is Liz Dean. You are in, so here is the plan.

If you already have an audience, you are ahead of almost everyone. The hard part, getting people to follow you, is done. Now it is about turning that attention into Amazon commissions without adding a second job.

Over the next couple of weeks I will walk you through the whole thing. Start here with the free course. It is built for exactly this:
https://www.influencerbutler.com/course/amazon-influencer

More soon.

Liz Dean
The Social Media Posse

P.S. Our free creator group is full of people doing this now: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000a-0000-4000-a000-00000000000a', 2, 3,
    'Set it up once, let it run',
    'Hi,

It is Liz Dean. The thing that separates creators who earn from Amazon and those who do not is usually follow-through on the boring parts: setting up the storefront, accepting brand campaigns, and pitching the brands you already sell.

Influencer Butler does those for you:

- Daily Commission Butler looks at what actually sold and accepts the matching Creator Connections campaigns, so a best-seller with an open campaign is never left unclaimed.
- Amazon Butler finds the brands behind what you have already sold and pitches them for new campaigns on autopilot.

It is a desktop app, free for 14 days, no card:
https://www.influencerbutler.com/go/download?src=livesweet

Liz Dean
The Social Media Posse

P.S. Join our free community of Amazon and Walmart creators: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000a-0000-4000-a000-00000000000a', 3, 6,
    'Two storefronts from the content you already make',
    'Hi,

It is Liz Dean with the update I am most excited about. If you post to an Amazon storefront, you can now earn from Walmart too, from the same content.

Walmart Repost takes the videos and photos already on your Amazon storefront and republishes them to your Walmart Creator storefront automatically, only when it is the exact same product (matched by barcode). Two income streams from content you already made, with no extra filming.

If you have not set the app up yet, the getting-started walkthrough makes it quick:
https://www.influencerbutler.com/help/tutorials/getting-started-influencer-butler

Or jump straight into the free trial: https://www.influencerbutler.com/go/download?src=livesweet

Liz Dean
The Social Media Posse

P.S. We share what is working on both platforms in the group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000a-0000-4000-a000-00000000000a', 4, 10,
    'How creators are actually using this',
    'Hi,

It is Liz Dean. A few ways creators are using Influencer Butler right now:

- Letting the app accept the Creator Connections campaigns that match their real sales, so nothing is left on the table.
- Turning products they already promote into ready-to-post captions in minutes.
- Copying their Amazon storefront over to Walmart for a second income stream.

If any of that sounds useful, your free 14-day trial is right here, no card:
https://www.influencerbutler.com/go/download?src=livesweet

Prefer to start with zero setup? A simple Facebook deals group is the lowest-effort way in, and the free course covers it: https://www.influencerbutler.com/course/amazon-influencer

Liz Dean
The Social Media Posse

P.S. Come meet other creators in our free group: https://www.facebook.com/groups/influencerbutler'
  ),
  (
    '1a5e000a-0000-4000-a000-00000000000a', 5, 14,
    'Last note from me',
    'Hi,

It is Liz Dean, last note on this. If turning your audience into Amazon commissions sounds worth an afternoon, here is everything in one place:

- The free course, start to finish: https://www.influencerbutler.com/course/amazon-influencer
- The app, free for 14 days, no card: https://www.influencerbutler.com/go/download?src=livesweet

Set it up once and the campaigns, outreach, and Walmart crossposting keep running while you make content.

It was good to reconnect after the Girls Grow Together days. Keep up the great work.

Liz Dean
The Social Media Posse

P.S. You are always welcome in our free creator group: https://www.facebook.com/groups/influencerbutler'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
