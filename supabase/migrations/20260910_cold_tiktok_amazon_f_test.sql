-- Variant F for the cold TikTok Amazon test (a fifth variant sequence).
--
-- WHY THIS EXISTS: the aggregate email dashboard shows a weak click-through rate
-- on cold sends (roughly 1% clicks / delivered, ~5% click-to-open). The A/B/C/D/E
-- variants can only ever move the OPEN rate and reply rate, because D and E are
-- deliberately reply-based with NO links in the body (the single CTA is a
-- one-word reply, "TikTok"). A reply-based email generates zero tracked clicks by
-- design, so none of them can lift the click metric the dashboard reports.
--
-- F is the click-optimized counterpart. It reintroduces exactly ONE link (the
-- established conversion link, /go/download) as the single CTA, keeps the copy
-- tighter than D, and leads with the creator's MONEY rather than the product:
-- every step opens on the two commission streams they have already earned the
-- right to (Amazon Creator Connections + Walmart) and frames the click as
-- collecting money that is already sitting there. This is a real A/B read against
-- D/E: does a money-forward single link beat a reply CTA on click-through and
-- downstream conversion, and is the click lift worth the deliverability cost of
-- putting a link back into a cold send? Success = beat the originals/A/B/C on
-- clicks per delivered at the same enrollment volume, without a worse bounce or
-- unsubscribe rate.
--
-- SINGLE-CTA DISCIPLINE: unlike the originals and A/B/C (which carried both a
-- /go/download link AND a P.S. Facebook-group link, two competing CTAs), F has
-- exactly one link per step and no P.S. link. That is the point of the test: one
-- clear action. Do not add a second link.
--
-- The originals (cold-tiktok-amazon) and A/B/C/D/E are left untouched. Do NOT
-- also tag these leads with another variant's tag, or they would double-enroll.
--
-- Same 0/3/7/14 day cadence as the other variants. Since these are cold,
-- unsolicited sends, every step goes through the compliant marketing sender
-- (sendMarketingEmail), which appends the one-click unsubscribe + postal-address
-- footer and honors the suppression list. Do not add either to the body copy. The
-- unsubscribe link in that footer plus the single /go/download CTA are the only
-- two links in the message.
--
-- Created PAUSED. Activate it in Emails > Sequences BEFORE tagging leads (cold
-- sequences: activate first, then tag). The Sequences enroll panel's "Split
-- evenly across the N variants" spreads a fresh batch across the siblings that
-- share the tag base cold-tiktok-amazon (now a / b / c / d / e / f). The tag is
-- normalized to lowercase-hyphen. For a list tagged before activating, use
-- Enroll > By tag to backfill.
--
-- Throttled to 150 sends/hour to match the other variants. track_opens is true so
-- Resend records opens/clicks (adds a minimal HTML body), which the test relies
-- on to read the click lift. send_hour is left unset so it drips continuously.
-- stream is left unset so it inherits the 'lifecycle' default
-- (20260910_email_stream.sql), exactly like A/B/C/D/E: marking it 'cold' would
-- route it to a separate cold domain and HOLD it while EMAIL_FROM_COLD is unset,
-- breaking the apples-to-apples read. auto_pause_enabled is left unset so it
-- inherits the true default (auto-pause on).
--
-- The id's first 8 hex chars (1a5e04f1) are distinct from A/B/C/D/E (1a5e04a1 /
-- 1a5e04b1 / 1a5e04c1 / 1a5e04d1 / 1a5e04e1) and the originals (1a5e0004), so
-- stepCategory() = seq_<shortId>_s<pos> does not collide and per-step open/click
-- stats stay separable (see the reid-fix migration for why this matters).
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps), 20260828_sequence_send_controls.sql (sends_per_hour),
-- and 20260902_sequence_track_opens.sql (track_opens). Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after those migrations.

-- ---------------------------------------------------------------------------
-- Variant F: Cold Leads: TikTok Amazon (F: Money-forward single link)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e04f1-0000-4000-a000-00000000004f',
  'Cold Leads: TikTok Amazon (F: Money-forward single link)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-f"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e04f1-0000-4000-a000-00000000004f', 1, 0,
    'the amazon money most tiktok creators skip',
    'Hi,

Found you on TikTok, then your Amazon storefront. You have already done the hard part: an audience that buys from you.

Here is what most creators leave sitting there. Every product you have sold has a brand behind it running paid Creator Connections campaigns, and the same storefront can earn a second time on Walmart. Two commission streams, both for work you have already done.

Influencer Butler finds and runs them for you. Start free and see it work in about 60 seconds: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e04f1-0000-4000-a000-00000000004f', 2, 3,
    'your amazon order history is a paid brand list',
    'Hi,

Quick follow-up with the part that surprises people most.

Every brand you have already sold on Amazon has a reason to pay you, and many run Creator Connections campaigns right now. Your order history is basically a list of brands ready to do deals. Nobody works that list by hand, because pulling it is miserable, so it just sits there.

Influencer Butler works it for you in the background. See your brand matches free: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e04f1-0000-4000-a000-00000000004f', 3, 7,
    'the second commission check hiding on walmart',
    'Hi,

One more, then I will leave you alone.

The storefront you have already built on Amazon can run on Walmart''s creator program too. Same products, same posts, a second commission check for work you have already done. Most creators never set it up, because copying it over by hand is tedious.

Influencer Butler copies it for you. Turn on the second stream free: https://www.influencerbutler.com/go/download

Liz'
  ),
  (
    '1a5e04f1-0000-4000-a000-00000000004f', 4, 14,
    'closing the loop',
    'Hi,

Last one from me, I do not want to clutter your inbox.

If collecting the Amazon and Walmart commissions you have already earned is ever worth 60 seconds, it is all here: https://www.influencerbutler.com/go/download

If not, no worries at all. I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
