-- Variant G for the cold TikTok Amazon test: F with a Launch Butler step 2.
--
-- WHY THIS EXISTS: as of 2026-11-17, F (money-forward single link) is the only
-- cold TikTok variant still converting (2 conversions on ~560 enrolled; A/B/C/D/E
-- produced 0 on ~1,600 between them). F's weak spot is step 2 ("your amazon
-- order history is a paid brand list"): ~10% open, 0 clicks. G keeps F's steps
-- 1, 3 and 4 word for word and swaps ONLY step 2 for a Launch Butler pitch: a
-- second channel (Facebook Page + deals group, Foyer shop, posting schedule)
-- that posts for them without new filming. Because everything else matches F,
-- any difference in conversions between F and G is the step 2 angle.
--
-- HOW TO READ IT: compare G's Converted chip against F's at similar enrollment
-- volume (both convert well under 1%, so expect to need ~300+ leads per arm).
-- Conversions are attributed last-touch, so a conversion credited to G step 2 or
-- later is the Launch Butler email doing its job. For a clean head-to-head, pause
-- A/B/C/D/E first so "Split evenly across the N variants" spreads a fresh batch
-- across F and G only (split-enroll skips non-active siblings).
--
-- CLAIMS: every Launch Butler claim in step 2 is shipped and matches the
-- group-launch tutorial (content/tutorials/group-launch.en-US.mdx) and the vetted
-- LAUNCH_BUTLER_LINE in src/lib/price-lock-emails.ts: Page + group, branding and
-- graphics, Foyer shop page with newsletter sign-up, a posting schedule that
-- starts slow and ramps up, one launch included on every plan. It also says up
-- front that a Facebook account is needed, since TikTok creators may not have
-- one in use. No income figures.
--
-- SINGLE-CTA DISCIPLINE (same as F): exactly one link per step, the established
-- conversion link /go/download, and no P.S. link. Do not add a second link.
--
-- Same 0/3/7/14 cadence, 150 sends/hour, track_opens true, send_hour unset,
-- stream unset (inherits the default like A-F), auto_pause_enabled unset
-- (auto-pause on). Sent through sendMarketingEmail, which appends the
-- unsubscribe + postal footer; do not add either to the body.
--
-- The id's first 8 hex chars (1a5e0471) are distinct from A-F (1a5e04a1 /
-- 1a5e04b1 / 1a5e04c1 / 1a5e04d1 / 1a5e04e1 / 1a5e04f1) and the original
-- (1a5e0004), so stepCategory() = seq_<shortId>_s<pos> does not collide. ("g" is
-- not a hex digit, hence 71.) The tag cold-tiktok-amazon-g still ends in a single
-- letter, so the split-enroll sibling regex ^(.+)-[a-z]$ groups it with A-F.
--
-- Created PAUSED. Activate it in Emails > Sequences BEFORE tagging leads. Do not
-- also tag these leads with another variant's tag, or they would double-enroll.
--
-- Depends on 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql
-- and 20260902_sequence_track_opens.sql. Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Variant G: Cold Leads: TikTok Amazon (G: Launch Butler step 2)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e0471-0000-4000-a000-000000000047',
  'Cold Leads: TikTok Amazon (G: Launch Butler step 2)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-g"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0471-0000-4000-a000-000000000047', 1, 0,
    'the amazon money most tiktok creators skip',
    'Hi,

Found you on TikTok, then your Amazon storefront. You have already done the hard part: an audience that buys from you.

Here is what most creators leave sitting there. Every product you have sold has a brand behind it running paid Creator Connections campaigns, and the same storefront can earn a second time on Walmart. Two commission streams, both for work you have already done.

Influencer Butler finds and runs them for you. Start free and see it work in about 60 seconds: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e0471-0000-4000-a000-000000000047', 2, 3,
    'a second channel that posts deals without you filming',
    'Hi,

Quick follow-up, because this one needs zero new videos.

Your TikTok followers already trust your Amazon picks. Launch Butler turns that trust into a second channel that runs on its own. You answer a few questions about your niche, and it does the setup that used to take hours:

- a Facebook Page and deals group, with your branding and graphics
- your own shop page with a newsletter sign-up
- a deal posting schedule that starts slow and ramps up by itself

One launch is included with every plan. You just need a Facebook account to connect. Watch it build your channel: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e0471-0000-4000-a000-000000000047', 3, 7,
    'the second commission check hiding on walmart',
    'Hi,

One more, then I will leave you alone.

The storefront you have already built on Amazon can run on Walmart''s creator program too. Same products, same posts, a second commission check for work you have already done. Most creators never set it up, because copying it over by hand is tedious.

Influencer Butler copies it for you. Turn on the second stream free: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e0471-0000-4000-a000-000000000047', 4, 14,
    'closing the loop',
    'Hi,

Last one from me, I do not want to clutter your inbox.

If collecting the Amazon and Walmart commissions you have already earned is ever worth 60 seconds, it is all here: https://www.influencerbutler.com/go/download

If not, no worries at all. I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
