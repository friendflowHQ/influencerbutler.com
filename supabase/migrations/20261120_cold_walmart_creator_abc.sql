-- Cold Leads: Walmart Creators, a three-way A/B/C opener test.
--
-- WHO: cold leads gathered by hand who are Walmart creators and NOT (as far as
-- we know) Amazon influencers. So nothing here pitches the Amazon-to-Walmart
-- tools (Walmart Repost, Collection Builder), which need an Amazon storefront.
--
-- GOAL: owner target is a 50% step-1 open rate. Trials and paid conversions are
-- tracked alongside (Converted chip, WALMART30 redemptions in
-- orders.discount_code) but are not the goal. For reference, the best cold
-- TikTok openers hit 44-52% opens and cold sequences convert ~0.3% to trial.
--
-- WHAT IS TESTED: which hook works best FIRST. All three variants cover the same
-- content blocks in a different order, and step 4 is identical everywhere:
--   A (Money first):     Money -> Autopilot -> Extension -> Close
--   B (Autopilot first): Autopilot -> Money -> Extension -> Close
--   C (Reply first):     one-question reply opener (no link) -> Autopilot -> Money -> Close
-- Money     = Walmart Performance (Creator sales, commission, storefront visits per
--             collection and post, read daily) + Walmart Research (price history,
--             estimated monthly sales).
-- Autopilot = WAL Deals Finder (16 of Walmart's own deal pages, only real
--             markdowns, posted on one schedule to the creator's destinations,
--             never an unattributed link) + Black Friday Event Finder.
-- Extension = free Chrome extension on walmart.com (price, rating, estimated
--             commission, Butler Score; markdowns + Send deals to app on
--             Rollback/savings pages).
-- Every claim is from the shipped tutorials (content/tutorials/deals,
-- walmart-performance, walmart-research, walmart-event-finder, extension).
--
-- SEASONAL: the Autopilot block has ONE Black Friday / Cyber Monday sentence
-- (A2, B1, C2). Remove that sentence on Dec 1 in Emails > Sequences > Edit, or
-- it reads stale until next November.
--
-- OFFER: free 14-day trial + shared code WALMART30 (30% off the first 3 months,
-- no expiry). Create it in Lemon Squeezy BEFORE activating (letters and digits
-- only; LS rejects hyphens). The code is in every step except C1, because the
-- cron stops a sequence as soon as the lead starts a trial.
--
-- SINGLE-CTA DISCIPLINE (same as cold TikTok F/G): at most one link per step,
-- /go/download, no P.S. link. C1 has no link (reply CTA). Replies to C1 land in
-- the hello@ inbox and need a human answer.
--
-- Same 0/3/7/14 cadence, 150 sends/hour, track_opens true (needed to read the
-- open-rate goal), send_hour unset (drips continuously), stream unset (inherits
-- the default like the other cold sequences), auto_pause_enabled unset (on).
-- Sent through sendMarketingEmail, which appends the unsubscribe + postal
-- footer; do not add either to the body.
--
-- IDs: first 8 hex chars 1a5e05a1 / 1a5e05b1 / 1a5e05c1 are distinct from every
-- other sequence (stepCategory() = seq_<first 8 hex>_s<pos> must not collide).
-- Tags cold-walmart-creator-a/-b/-c end in a single letter, so the Sequences
-- enroll panel offers "Split evenly across the 3 variants (A / B / C)". Pause a
-- losing variant to take it out of the split.
--
-- Created PAUSED. Activate all three BEFORE enrolling. Depends on
-- 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql and
-- 20260902_sequence_track_opens.sql. Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor.

INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES
  (
    '1a5e05a1-0000-4000-a000-0000000005a1',
    'Cold Leads: Walmart Creators (A: Money first)',
    'paused',
    '{"kind":"tag_added","tag":"cold-walmart-creator-a"}'::jsonb,
    150,
    true,
    'elizabethdean30@gmail.com'
  ),
  (
    '1a5e05b1-0000-4000-a000-0000000005b1',
    'Cold Leads: Walmart Creators (B: Autopilot first)',
    'paused',
    '{"kind":"tag_added","tag":"cold-walmart-creator-b"}'::jsonb,
    150,
    true,
    'elizabethdean30@gmail.com'
  ),
  (
    '1a5e05c1-0000-4000-a000-0000000005c1',
    'Cold Leads: Walmart Creators (C: Reply first)',
    'paused',
    '{"kind":"tag_added","tag":"cold-walmart-creator-c"}'::jsonb,
    150,
    true,
    'elizabethdean30@gmail.com'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Variant A: Money first
-- ---------------------------------------------------------------------------
INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e05a1-0000-4000-a000-0000000005a1', 1, 0,
    'what your walmart posts actually earn',
    'Hi,

I came across you as a Walmart creator, so a quick question most Walmart creators cannot answer: which of your posts and collections actually make the money?

Influencer Butler reads your Walmart Creator numbers into one place every day: sales, commission and storefront visits for each collection and post. And for any Walmart product you look up, it tracks the price history and estimated monthly sales, so you can see what is worth posting.

Try it free for 14 days: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05a1-0000-4000-a000-0000000005a1', 2, 3,
    'walmart deals, found and posted for you',
    'Hi,

Quick follow-up on the part that saves the most time.

Finding Walmart deals by hand means scrolling Rollbacks and clearance every day. Influencer Butler checks 16 of Walmart''s own deal pages for you, keeps only the items Walmart has actually marked down, and posts them on your schedule to your Facebook groups and Pages, Instagram, Threads, Telegram and more. It never posts a link you would not earn on.

With Black Friday and Cyber Monday here, its Black Friday Event Finder also lets you queue Walmart''s event deals ahead of time.

See it work free: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05a1-0000-4000-a000-0000000005a1', 3, 7,
    'is this walmart product worth posting?',
    'Hi,

One more, then I will leave you alone.

Our free Chrome extension works right on walmart.com. Open any product and it shows the price, the rating, an estimated commission and a Butler Score, so you can tell in seconds whether it is worth posting. On Rollback and savings pages it shows each markdown and sends the discounted items to the app in one click.

Get the app free: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05a1-0000-4000-a000-0000000005a1', 4, 14,
    'closing the loop',
    'Hi,

Last one from me, I do not want to clutter your inbox.

If seeing what your Walmart posts earn, and having Walmart deals posted for you, is ever worth 60 seconds, it is all here: https://www.influencerbutler.com/go/download

Your code WALMART30 still works: 30% off your first 3 months after the free trial. The Chrome extension for walmart.com is free either way.

If not, no worries at all. I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Variant B: Autopilot first
-- ---------------------------------------------------------------------------
INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e05b1-0000-4000-a000-0000000005b1', 1, 0,
    'walmart deals, found and posted for you',
    'Hi,

I came across you as a Walmart creator, so a quick one.

Finding Walmart deals by hand means scrolling Rollbacks and clearance every day. Influencer Butler checks 16 of Walmart''s own deal pages for you, keeps only the items Walmart has actually marked down, and posts them on your schedule to your Facebook groups and Pages, Instagram, Threads, Telegram and more. It never posts a link you would not earn on.

With Black Friday and Cyber Monday here, its Black Friday Event Finder also lets you queue Walmart''s event deals ahead of time.

Try it free for 14 days: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05b1-0000-4000-a000-0000000005b1', 2, 3,
    'what your walmart posts actually earn',
    'Hi,

Quick follow-up with the question most Walmart creators cannot answer: which of your posts and collections actually make the money?

Influencer Butler reads your Walmart Creator numbers into one place every day: sales, commission and storefront visits for each collection and post. And for any Walmart product you look up, it tracks the price history and estimated monthly sales, so you can see what is worth posting.

See your numbers free: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05b1-0000-4000-a000-0000000005b1', 3, 7,
    'is this walmart product worth posting?',
    'Hi,

One more, then I will leave you alone.

Our free Chrome extension works right on walmart.com. Open any product and it shows the price, the rating, an estimated commission and a Butler Score, so you can tell in seconds whether it is worth posting. On Rollback and savings pages it shows each markdown and sends the discounted items to the app in one click.

Get the app free: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05b1-0000-4000-a000-0000000005b1', 4, 14,
    'closing the loop',
    'Hi,

Last one from me, I do not want to clutter your inbox.

If seeing what your Walmart posts earn, and having Walmart deals posted for you, is ever worth 60 seconds, it is all here: https://www.influencerbutler.com/go/download

Your code WALMART30 still works: 30% off your first 3 months after the free trial. The Chrome extension for walmart.com is free either way.

If not, no worries at all. I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Variant C: Reply first (step 1 has no link)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e05c1-0000-4000-a000-0000000005c1', 1, 0,
    'quick walmart creator question',
    'Hi,

I came across you as a Walmart creator, so one quick question.

Are you still finding and posting your Walmart deals by hand?

If so, just reply "walmart" and I will send you the 60-second version of how to put that on autopilot.

Liz'
  ),
  (
    '1a5e05c1-0000-4000-a000-0000000005c1', 2, 3,
    'walmart deals, found and posted for you',
    'Hi,

Here is the 60-second version, in case you did not get a chance to reply.

Finding Walmart deals by hand means scrolling Rollbacks and clearance every day. Influencer Butler checks 16 of Walmart''s own deal pages for you, keeps only the items Walmart has actually marked down, and posts them on your schedule to your Facebook groups and Pages, Instagram, Threads, Telegram and more. It never posts a link you would not earn on.

With Black Friday and Cyber Monday here, its Black Friday Event Finder also lets you queue Walmart''s event deals ahead of time.

Try it free for 14 days: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05c1-0000-4000-a000-0000000005c1', 3, 7,
    'what your walmart posts actually earn',
    'Hi,

One more, then I will leave you alone.

Most Walmart creators cannot say which of their posts and collections actually make the money. Influencer Butler reads your Walmart Creator numbers into one place every day: sales, commission and storefront visits for each collection and post. And for any Walmart product you look up, it tracks the price history and estimated monthly sales, so you can see what is worth posting.

See your numbers free: https://www.influencerbutler.com/go/download

Use code WALMART30 at checkout for 30% off your first 3 months after the free trial.

Liz'
  ),
  (
    '1a5e05c1-0000-4000-a000-0000000005c1', 4, 14,
    'closing the loop',
    'Hi,

Last one from me, I do not want to clutter your inbox.

If seeing what your Walmart posts earn, and having Walmart deals posted for you, is ever worth 60 seconds, it is all here: https://www.influencerbutler.com/go/download

Your code WALMART30 still works: 30% off your first 3 months after the free trial. The Chrome extension for walmart.com is free either way.

If not, no worries at all. I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
