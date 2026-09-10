-- Variant D for the cold TikTok Amazon opener test (a fourth variant sequence).
--
-- The A/B/C opener test (20260904_cold_tiktok_amazon_abc_test.sql, re-ided by
-- 20260905_cold_amazon_abc_reid_fix.sql) showed variant C (low-friction, step 1
-- asks for a reply, not a download) opening and clicking best: ~21% open / 4%
-- click, beating A (plain identity line, 19% / 1%) and B (clever/abstract
-- subject, 12% / 2%). B's riddle subject was the weakest opener; A's plain
-- identity framing opened well; the proof/curiosity angle worked as a FOLLOW-UP
-- (step 2, ~28-29%) but not as an opener.
--
-- D is the synthesis those numbers point to: C's low-friction reply CTA + A's
-- plain identity framing, naming Influencer Butler once, with B's proof angle
-- moved into step 2. It is fully reply-based with NO links in the body: the
-- single CTA is a one-word reply, "TikTok". That is deliberate for cold
-- deliverability. Success = beat C's step 1 and generate more "TikTok" replies
-- at the same enrollment volume as A/B/C.
--
-- The originals (cold-tiktok-amazon) and A/B/C are left untouched. Do NOT also
-- tag these leads with another variant's tag, or they would double-enroll.
--
-- Same 0/3/7/14 day cadence as A/B/C. Since these are cold, unsolicited sends,
-- every step goes through the compliant marketing sender (sendMarketingEmail),
-- which appends the one-click unsubscribe + postal-address footer and honors the
-- suppression list. Do not add either to the body copy. The unsubscribe link in
-- that footer is the only link in the message and is legally required.
--
-- Created PAUSED. Activate it in Emails > Sequences BEFORE tagging leads (cold
-- sequences: activate first, then tag). The Sequences enroll panel's "Split
-- evenly across the N variants" now spreads a fresh batch across a / b / c / d
-- automatically (siblings share the tag base cold-tiktok-amazon). The tag is
-- normalized to lowercase-hyphen. For a list tagged before activating, use
-- Enroll > By tag to backfill.
--
-- Throttled to 150 sends/hour to match A/B/C. track_opens is true so Resend
-- records opens/clicks (adds a minimal HTML body), which the test relies on.
-- send_hour is left unset so it drips continuously like the others. stream is
-- left unset so it inherits the 'lifecycle' default (20260910_email_stream.sql),
-- exactly like A/B/C: marking it 'cold' would route it to a separate cold domain
-- and HOLD it while EMAIL_FROM_COLD is unset, breaking the apples-to-apples read
-- against the lifecycle-stream A/B/C. auto_pause_enabled is left unset so it
-- inherits the true default (auto-pause on).
--
-- The id's first 8 hex chars (1a5e04d1) are distinct from A/B/C (1a5e04a1 /
-- 1a5e04b1 / 1a5e04c1) and the originals (1a5e0004), so stepCategory() =
-- seq_<shortId>_s<pos> does not collide and per-step open/click stats stay
-- separable (see the reid-fix migration for why this matters).
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps), 20260828_sequence_send_controls.sql (sends_per_hour),
-- and 20260902_sequence_track_opens.sql (track_opens). Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after those migrations.

-- ---------------------------------------------------------------------------
-- Variant D: Cold Leads: TikTok Amazon (D: Named low-friction)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e04d1-0000-4000-a000-00000000004d',
  'Cold Leads: TikTok Amazon (D: Named low-friction)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-d"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e04d1-0000-4000-a000-00000000004d', 1, 0,
    'quick one about your amazon storefront',
    'Hi,

Found you on TikTok and ended up on your Amazon storefront. You are already doing the hard part.

Two things most creators leave sitting there: brand deals that match what you have already shown, and products you posted once and never circled back to.

I built a tool called Influencer Butler that automates both in the background. Want a quick 60-second rundown of how it works? No call, no pitch.

Just reply "TikTok" and I will send it over.

Liz'
  ),
  (
    '1a5e04d1-0000-4000-a000-00000000004d', 2, 3,
    'the brand deals you already qualified for',
    'Hi,

Following up on the storefront thing with a clearer picture of what I mean.

Every product you have already sold on Amazon has a brand behind it, and most of those brands run Creator Connections campaigns. Your order history is basically a list of brands who already have a reason to pay you. Nobody works that list by hand, because pulling it is miserable.

That is the part Influencer Butler runs on its own. Still happy to send the 60-second rundown. Reply "TikTok" and it is yours.

Liz'
  ),
  (
    '1a5e04d1-0000-4000-a000-00000000004d', 3, 7,
    'your amazon storefront could be on walmart too',
    'Hi,

One more idea, then I will leave you alone.

The same products you have built on Amazon can run on Walmart''s creator program too, which is a second commission stream for work you have already done. Influencer Butler copies your storefront over so you are not rebuilding it by hand.

Want me to include that in the rundown? Reply "TikTok" and I will send everything.

Liz'
  ),
  (
    '1a5e04d1-0000-4000-a000-00000000004d', 4, 14,
    'want me to stop here?',
    'Hi,

I do not want to clutter your inbox, so this is the last one from me.

If automating your Amazon (and Walmart) commissions is ever worth a look, just reply "TikTok" and I will send the 60-second rundown. If not, no worries at all, I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
