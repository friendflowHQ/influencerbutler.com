-- Variant E for the cold TikTok Amazon opener test: variant D's twin with the
-- alternate step-1 subject line, so the subject can be A/B tested in isolation.
--
-- D (20260910_cold_tiktok_amazon_d_test.sql) opens step 1 with the subject
-- "quick one about your amazon storefront". The build spec listed an optional
-- subject split, "the amazon part of your tiktok". A single sequence step carries
-- one subject, so testing the second subject means a second sequence that is
-- IDENTICAL to D in every other respect (all four bodies, and the step 2-4
-- subjects) and differs only in the step-1 subject. Split fresh leads between D
-- and E and the difference in step-1 open rate is the subject line, nothing else.
--
-- Everything else matches D and the A/B/C family: PAUSED, tag
-- cold-tiktok-amazon-e, 150 sends/hour, track_opens=true, send_hour unset,
-- 0/3/7/14 cadence, stream left unset (inherits 'lifecycle' like the others so it
-- sends on the brand domain rather than being held for a cold domain),
-- auto_pause_enabled left unset (inherits true = auto-pause on). Fully
-- reply-based: no links in the body, the CTA is a one-word reply "TikTok". The
-- compliant unsubscribe + postal footer is auto-appended by sendMarketingEmail;
-- keep it out of the body.
--
-- The id's first 8 hex chars (1a5e04e1) are distinct from D (1a5e04d1), A/B/C
-- (1a5e04a1 / 1a5e04b1 / 1a5e04c1) and the originals (1a5e0004), so stepCategory()
-- does not collide and per-step open/click stats stay separable (the reid-fix
-- lesson, 20260905_cold_amazon_abc_reid_fix.sql). The "Split evenly across the N
-- variants" enroll now spreads a fresh batch across a / b / c / d / e
-- automatically (siblings share the tag base cold-tiktok-amazon).
--
-- Depends on 20260817_email_marketing.sql, 20260828_sequence_send_controls.sql,
-- and 20260902_sequence_track_opens.sql. Idempotent, safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after those migrations (and after the D migration).

-- ---------------------------------------------------------------------------
-- Variant E: Cold Leads: TikTok Amazon (E: Named low-friction, alt subject)
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, track_opens, created_by)
VALUES (
  '1a5e04e1-0000-4000-a000-00000000004e',
  'Cold Leads: TikTok Amazon (E: Named low-friction, alt subject)',
  'paused',
  '{"kind":"tag_added","tag":"cold-tiktok-amazon-e"}'::jsonb,
  150,
  true,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e04e1-0000-4000-a000-00000000004e', 1, 0,
    'the amazon part of your tiktok',
    'Hi,

Found you on TikTok and ended up on your Amazon storefront. You are already doing the hard part.

Two things most creators leave sitting there: brand deals that match what you have already shown, and products you posted once and never circled back to.

I built a tool called Influencer Butler that automates both in the background. Want a quick 60-second rundown of how it works? No call, no pitch.

Just reply "TikTok" and I will send it over.

Liz'
  ),
  (
    '1a5e04e1-0000-4000-a000-00000000004e', 2, 3,
    'the brand deals you already qualified for',
    'Hi,

Following up on the storefront thing with a clearer picture of what I mean.

Every product you have already sold on Amazon has a brand behind it, and most of those brands run Creator Connections campaigns. Your order history is basically a list of brands who already have a reason to pay you. Nobody works that list by hand, because pulling it is miserable.

That is the part Influencer Butler runs on its own. Still happy to send the 60-second rundown. Reply "TikTok" and it is yours.

Liz'
  ),
  (
    '1a5e04e1-0000-4000-a000-00000000004e', 3, 7,
    'your amazon storefront could be on walmart too',
    'Hi,

One more idea, then I will leave you alone.

The same products you have built on Amazon can run on Walmart''s creator program too, which is a second commission stream for work you have already done. Influencer Butler copies your storefront over so you are not rebuilding it by hand.

Want me to include that in the rundown? Reply "TikTok" and I will send everything.

Liz'
  ),
  (
    '1a5e04e1-0000-4000-a000-00000000004e', 4, 14,
    'want me to stop here?',
    'Hi,

I do not want to clutter your inbox, so this is the last one from me.

If automating your Amazon (and Walmart) commissions is ever worth a look, just reply "TikTok" and I will send the 60-second rundown. If not, no worries at all, I will leave you to it.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
