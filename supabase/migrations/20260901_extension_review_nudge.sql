-- Chrome extension "leave a review" nudge: a warm drip that asks people who
-- installed the free extension to rate it on the Chrome Web Store, plus a small
-- lifecycle table so we can see who was asked, who clicked through, and who
-- reported leaving one.
--
-- How it flows end to end:
--   1. The extension captures an email at/after install and POSTs it to
--      /api/extension/review/optin, which lands the address in email_subscribers
--      with source = 'extension-install', tags it 'ext-review-nudge', and writes
--      an extension_review_nudges lifecycle row.
--   2. The tag auto-enrolls the address into the sequence below (once it is
--      active), so the day-10 / day-17 / day-28 steps drip out from install.
--   3. Each step carries a per-recipient {{REVIEW_URL}} (tracked redirect to the
--      Web Store review page, stamps review_clicked_at) and a {{REVIEW_CONFIRM_URL}}
--      ("already left one? tell us so we stop asking", stamps review_left_at and
--      cancels the enrollment). The cron fills those placeholders per recipient.
--
-- Because this asks HAPPY users (including paying ones) for a review, the cron
-- deliberately exempts this sequence from stop-on-subscribe, unlike the
-- re-engagement drips. The self-report confirm link is what stops it.
--
-- Every step goes through the compliant marketing sender, which appends the
-- one-click unsubscribe and postal-address footer and honors the suppression
-- list. Do not add either to the body copy.
--
-- Seeded PAUSED: nothing sends until you Activate it in Emails > Sequences.
-- Auto-enroll only fires while active, so for installs captured before you
-- activate, use Enroll > By tag (ext-review-nudge) to backfill.
--
-- Depends on 20260817_email_marketing.sql (email_sequences /
-- email_sequence_steps). Everything is idempotent and safe to re-run.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20260817_email_marketing.sql.

-- ---------------------------------------------------------------------------
-- Lifecycle table: one row per address we asked, tracking the review funnel.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS extension_review_nudges (
  email             TEXT PRIMARY KEY,        -- always lowercased + trimmed
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when we first heard from this install
  review_clicked_at TIMESTAMPTZ,             -- clicked through to the Web Store review page
  review_left_at    TIMESTAMPTZ,             -- self-reported "yes, I left a review"
  -- Feedback survey + reward. Kept deliberately SEPARATE from the review fields:
  -- the 99%-off-first-month code is earned by completing the on-site feedback
  -- survey, never by leaving (or promising) a review. Rewarding a Web Store
  -- review would violate Chrome Web Store + FTC policy, so the two must not be
  -- coupled in code or copy.
  survey_completed_at TIMESTAMPTZ,           -- finished the feedback survey (earns the code)
  survey_rating       SMALLINT,              -- 1-5: how useful they find the extension
  survey_use          TEXT,                  -- what they use it for (short free text)
  survey_feedback     TEXT,                  -- anything else they want us to know
  discount_code       TEXT,                  -- minted LS code, 99% off first month of Pro
  ls_discount_id      TEXT,                  -- LS discount record id, for state lookups
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reporting scans filter on who has / has not left one yet.
CREATE INDEX IF NOT EXISTS extension_review_nudges_left_idx
  ON extension_review_nudges (review_left_at);

-- Service-role only (the API routes use the admin client), same as the other
-- extension_* tables.
ALTER TABLE extension_review_nudges ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- The drip sequence.
-- ---------------------------------------------------------------------------
INSERT INTO email_sequences (id, name, status, trigger, created_by)
VALUES (
  '1a5e0005-0000-4000-a000-000000000005',
  'Chrome Extension: leave a review',
  'paused',
  '{"kind":"tag_added","tag":"ext-review-nudge"}'::jsonb,
  'elizabethdean30@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    '1a5e0005-0000-4000-a000-000000000005', 1, 10,
    'A thank-you gift for trying Influencer Butler',
    'Hi,

It is Liz from The Social Media Posse. You installed the free Influencer Butler Chrome extension about a week and a half ago, so first off: thank you. I hope the money signals and content checks have been earning their keep on your Amazon pages.

Two quick and completely separate things:

1) I would love your honest feedback. Take this 60-second survey and, as a thank-you for filling it out, I will hand you 99 percent off your first month of Pro. The gift is for the feedback itself, whatever you tell me, good or bad:
{{FEEDBACK_URL}}

2) Separately, with no strings and no reward attached: if the extension has been useful, an honest review on the Chrome Web Store helps other creators find it. Only if you feel like it, and only if it is honest:
{{REVIEW_URL}}

Already reviewed us? Thank you. Let me know so I stop mentioning it:
{{REVIEW_CONFIRM_URL}}

Thanks for giving it a try,
Liz
The Social Media Posse'
  ),
  (
    '1a5e0005-0000-4000-a000-000000000005', 2, 17,
    'Your 99 percent off is still waiting',
    'Hi again,

It is Liz. If you have not grabbed it yet, that thank-you is still open: fill out the quick feedback survey and I will give you 99 percent off your first month of Pro. It takes about a minute, and your honest answers genuinely shape what we build next:
{{FEEDBACK_URL}}

If something is NOT working the way you hoped, that is exactly the feedback I want. You can also just reply to this email and it comes straight to me.

And separately, with no reward attached, an honest Chrome Web Store review helps other Amazon creators find the extension, only if you are up for it:
{{REVIEW_URL}}

Already reviewed us? Tell me here and I will stop asking:
{{REVIEW_CONFIRM_URL}}

Thanks so much,
Liz
The Social Media Posse'
  ),
  (
    '1a5e0005-0000-4000-a000-000000000005', 3, 28,
    'Last call on your 99 percent off',
    'Hi,

It is Liz, last note from me on this. The thank-you offer is about to close: a 60-second feedback survey gets you 99 percent off your first month of Pro. I read every response myself:
{{FEEDBACK_URL}}

If the extension has been worth having in your browser and you feel like it, an honest Chrome Web Store review helps other creators find it too. No reward for that one, just our gratitude:
{{REVIEW_URL}}

Already left a review? Thank you. Let me know so this is the end of it:
{{REVIEW_CONFIRM_URL}}

Either way, thank you for giving Influencer Butler a try.
Liz
The Social Media Posse'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
