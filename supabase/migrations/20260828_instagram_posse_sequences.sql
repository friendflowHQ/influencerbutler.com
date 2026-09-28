-- Instagram Posse re-engagement funnels (custom drip sequences).
--
-- Seeds two tag-triggered sequences for re-engaging The Social Media Posse
-- course/community list from the admin Emails > Sequences tab:
--   1. instagram-posse-vip  -> old PAYING course clients (40% off, POSSEVIP40)
--   2. instagram-posse       -> non-client community members (20% off, POSSE20)
--
-- Both are created PAUSED. Nothing sends until you Activate them in the UI.
-- Auto-enroll fires when a contact is tagged (Contacts tab import, or manual
-- bulk-tag): the tag is normalized to lowercase-hyphen, so typing
-- "Instagram Posse VIP" / "Instagram Posse" matches these triggers exactly.
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps). Everything is idempotent and safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql.
--
-- BEFORE ACTIVATING, in Lemon Squeezy create the two discount codes (codes must
-- have NO hyphens): POSSEVIP40 (40% off, monthly + yearly) and POSSE20 (20%
-- off). Set each to expire on the date used in the copy below (September 21,
-- 2026). If you activate later than that, edit the codes, dates, and expiry to
-- match. The copy is fully editable from the Sequences tab afterward.

-- ---------------------------------------------------------------------------
-- Sequence 1: Instagram Posse VIP (old paying clients)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, created_by)
VALUES (
  '1a5e0001-0000-4000-a000-000000000001',
  'Instagram Posse VIP',
  'paused',
  '{"kind":"tag_added","tag":"instagram-posse-vip"}'::jsonb,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0001-0000-4000-a000-000000000001', 1, 0,
    'It has been a while, and I built you something',
    'Hi,

It is Liz from The Social Media Posse. It has been a while since our Instagram course days, and I wanted to reach out personally.

Since then I built Influencer Butler: a tool that does the tedious parts of creator work for you. It finds the products worth promoting, drafts your posts, and keeps your affiliate links and campaigns organized, so you can spend your time creating instead of chasing spreadsheets.

Because you were one of my paying students, I want to hand you the best deal I offer anyone.

Start a free 14-day trial, and if you subscribe by September 21, 2026, use code POSSEVIP40 for 40% off. It works on monthly and yearly plans.

Start your free trial: https://www.influencerbutler.com/go/download

I would love to see you back.

Liz
The Social Media Posse'
  ),
  (
    '1a5e0001-0000-4000-a000-000000000001', 2, 2,
    'The part of Butler that works while you sleep',
    'Hi,

Quick follow-up. The feature most of my old students love first is the one that runs on its own.

You point Influencer Butler at what you want to promote, and it works in the background: surfacing products with real earning potential, drafting captions in your voice, and lining up posts so your storefront keeps moving even on the days you are busy.

It is the difference between doing creator work by hand and having an assistant handle the busywork.

Your 40% welcome-back code POSSEVIP40 is still good through September 21, 2026 (monthly or yearly).

Start your free trial: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e0001-0000-4000-a000-000000000001', 3, 5,
    'Your Posse VIP 40% is still open',
    'Hi,

Just a nudge: your VIP code POSSEVIP40 gives you 40% off Influencer Butler, and it is only open to my former students.

Creators using it tell me the same thing: it saves hours a week and helps them find products they would have scrolled right past.

Try it free for 14 days, and lock in 40% (monthly or yearly) if you subscribe by September 21, 2026.

Start your free trial: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse'
  ),
  (
    '1a5e0001-0000-4000-a000-000000000001', 4, 10,
    'Last call: your VIP code expires soon',
    'Hi,

This is the last reminder I will send about this. Your VIP code POSSEVIP40 (40% off, monthly or yearly) expires September 21, 2026.

If you have been meaning to give Influencer Butler a look, now is the time. Start the free 14-day trial, and apply the code at checkout if you decide to stay.

Start your free trial: https://www.influencerbutler.com/go/download
Apply your code at checkout: https://www.influencerbutler.com/pricing

Either way, it was good to be back in touch.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sequence 2: Instagram Posse (non-client community members)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, created_by)
VALUES (
  '1a5e0002-0000-4000-a000-000000000002',
  'Instagram Posse community',
  'paused',
  '{"kind":"tag_added","tag":"instagram-posse"}'::jsonb,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0002-0000-4000-a000-000000000002', 1, 0,
    'Hey from The Social Media Posse, we built something new',
    'Hi,

It is Liz from The Social Media Posse. You have been part of our community, so I wanted you to be among the first to hear about what I have been building.

It is called Influencer Butler. It takes the tedious parts of being a creator (finding products worth promoting, writing posts, managing affiliate links and campaigns) and does them for you, so the work feels a lot lighter.

You can try it free for 14 days. And as a community member, use code POSSE20 for 20% off if you decide to subscribe by September 21, 2026.

Start your free trial: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse'
  ),
  (
    '1a5e0002-0000-4000-a000-000000000002', 2, 3,
    'What Influencer Butler actually does for creators',
    'Hi,

A bit more on how Influencer Butler helps, in plain terms:

- It finds products with real earning potential, so you are not guessing what to promote.
- It drafts captions and posts in your voice, so you start from something instead of a blank screen.
- It keeps your affiliate links, campaigns, and deals organized in one place.

Most of it runs in the background, which means less busywork and more time creating.

If you want to poke around for free first, our Chrome extension shows money signals right on the pages you already browse: https://www.influencerbutler.com/extension

Or start the full free trial: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e0002-0000-4000-a000-000000000002', 3, 7,
    'How creators are using this right now',
    'Hi,

A few ways creators in the community are using Influencer Butler:

- Spotting products worth promoting before they blow up, instead of after.
- Turning a product into ready-to-post captions in minutes.
- Keeping every affiliate link and campaign in one tidy place.

If any of that sounds useful, your intro code POSSE20 gives you 20% off (good through September 21, 2026).

Start your free 14-day trial: https://www.influencerbutler.com/go/download

Liz
The Social Media Posse'
  ),
  (
    '1a5e0002-0000-4000-a000-000000000002', 4, 14,
    'Your intro discount ends soon',
    'Hi,

Last note from me on this. Your community code POSSE20 (20% off) expires September 21, 2026.

If you have been curious about Influencer Butler, the free 14-day trial is the easy way to see if it fits how you work. No pressure either way.

Start your free trial: https://www.influencerbutler.com/go/download
Apply your code at checkout: https://www.influencerbutler.com/pricing

Thanks for being part of the community.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
