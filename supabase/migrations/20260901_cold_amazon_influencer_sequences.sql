-- Cold-outreach drip sequences for known Amazon influencers (custom sequences).
--
-- Seeds two tag-triggered sequences for cold leads found by hand on social,
-- people who ALREADY do Amazon influencer work, from the admin Emails >
-- Sequences tab:
--   1. cold-ig-amazon       -> Amazon influencers found on Instagram
--   2. cold-tiktok-amazon   -> Amazon influencers found on TikTok
--
-- Both lead with the free 14-day Pro trial (no discount code, no card). Since
-- these are cold, unsolicited sends, every step goes through the compliant
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
-- the Supabase SQL editor AFTER those two migrations.

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

It is Elizabeth from The Social Media Posse. I came across your Instagram and saw you are already sharing Amazon finds with your followers. That is exactly who we built Influencer Butler for.

Influencer Butler is a desktop app that does the slow parts of Amazon influencer work for you:

- Finds the day''s best Amazon deals worth posting
- Drafts and schedules the posts across your accounts
- Tracks the campaigns and commissions so nothing slips through

You can try it free for 14 days, no card required.

Start here: https://www.influencerbutler.com/go/download

If it is not for you, no worries at all.

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 2, 3,
    'The part that works while you sleep',
    'Hi again,

It is Elizabeth. The thing most Amazon creators tell me they hate is the daily grind: hunting for a good deal, writing the caption, remembering to post. Influencer Butler does that on a schedule, so your storefront keeps earning even on the days you are slammed.

Creators are using it to post several Amazon deals a day without sitting at their computer for it.

Your free 14-day trial is right here: https://www.influencerbutler.com/go/download

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 3, 7,
    'How Amazon creators are actually using this',
    'Hi,

Elizabeth here. A quick look at how people like you are using Influencer Butler day to day:

- Morning: it surfaces the best Amazon deals of the day
- One click turns them into scheduled Instagram posts
- It quietly tracks which posts drove commissions

That is hours a week back, and more consistent posting than doing it by hand.

The 14-day free trial is still open: https://www.influencerbutler.com/go/download

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0003-0000-4000-a000-000000000003', 4, 14,
    'Last note from me',
    'Hi,

It is Elizabeth, last note from me.

If automating your Amazon posting sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep up the great content.

Elizabeth
The Social Media Posse'
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

It is Elizabeth from The Social Media Posse. I found your TikTok and saw you are already making Amazon finds videos for your followers. That is exactly who we built Influencer Butler for.

Influencer Butler is a desktop app that handles the slow parts of Amazon influencer work:

- Finds the day''s best Amazon deals worth featuring
- Drafts and schedules your posts across accounts
- Tracks campaigns and commissions so nothing slips through

Free for 14 days, no card required: https://www.influencerbutler.com/go/download

If it is not for you, no worries at all.

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 2, 3,
    'The part that works while you sleep',
    'Hi again,

It is Elizabeth. The thing most Amazon creators tell me they hate is the daily grind: finding a deal worth a video, writing it up, remembering to post. Influencer Butler lines that up on a schedule, so your storefront keeps earning on the days you are busy filming.

Free 14-day trial, no card: https://www.influencerbutler.com/go/download

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 3, 7,
    'How Amazon creators are actually using this',
    'Hi,

Elizabeth here. How people like you are using Influencer Butler day to day:

- Morning: it surfaces the best Amazon deals of the day
- One click turns them into scheduled posts and links for your TikTok
- It quietly tracks which ones drove commissions

That is hours a week back, and more consistent posting than doing it by hand.

Your 14-day free trial is still open: https://www.influencerbutler.com/go/download

Elizabeth
The Social Media Posse'
  ),
  (
    '1a5e0004-0000-4000-a000-000000000004', 4, 14,
    'Last note from me',
    'Hi,

It is Elizabeth, last note from me.

If automating your Amazon posting sounds useful, the free 14-day trial is right here: https://www.influencerbutler.com/go/download

If not, I will leave you to it. Either way, keep making great videos.

Elizabeth
The Social Media Posse'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
