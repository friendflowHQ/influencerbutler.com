-- Invite-only "done-for-you Foyer page" pilot.
--
-- Each row is one Instagram creator Liz (via Claude) researched by hand: a draft
-- Foyer page built from their own public bio + link-in-bio links, a private
-- noindex preview at /p/<code>, and the personalized opener that the
-- "Invite: Foyer page (Instagram)" cold sequence drops into its emails through
-- the {{INVITE_*}} placeholders (src/lib/foyer-invites.ts). Claiming issues a
-- 14-day Power User in-house comp (kind 'invite') and the desktop app pulls the
-- page_doc + launch_answers through /api/invites/redeem.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor after 20261108_comp_conversion.sql and
-- 20260910_email_stream.sql. Everything is IF NOT EXISTS / idempotent.

CREATE TABLE IF NOT EXISTS foyer_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,          -- the private preview capability (/p/<code>)
  ig_handle       TEXT NOT NULL,
  email           TEXT NOT NULL,                 -- lowercased; the creator's PUBLIC email
  first_name      TEXT NOT NULL DEFAULT '',
  niche           TEXT NOT NULL DEFAULT '',
  followers       INT,
  opener          TEXT NOT NULL DEFAULT '',      -- the 2-3 sentences written for this creator
  batch           TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'ig-research',
  evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_doc        JSONB NOT NULL,
  preview_html    TEXT NOT NULL,
  launch_answers  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','sent','viewed','claimed','activated','published','converted','declined')),
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                   -- set to first send + 14 days
  viewed_at       TIMESTAMPTZ,
  view_count      INT NOT NULL DEFAULT 0,
  claimed_at      TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,                   -- desktop redeemed (key active + page imported)
  published_at    TIMESTAMPTZ,
  converted_at    TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,
  claim_user_id   UUID,
  license_key     TEXT,                          -- the comp key (license_keys stores it in plaintext too)
  existing_customer BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS foyer_invites_email_uidx ON foyer_invites (lower(email));
CREATE INDEX IF NOT EXISTS foyer_invites_batch_idx ON foyer_invites (batch, created_at DESC);
CREATE INDEX IF NOT EXISTS foyer_invites_status_idx ON foyer_invites (status);
ALTER TABLE foyer_invites ENABLE ROW LEVEL SECURITY;  -- service role only

-- Allow the new comp kind.
ALTER TABLE comp_grants DROP CONSTRAINT IF EXISTS comp_grants_kind_check;
ALTER TABLE comp_grants
  ADD CONSTRAINT comp_grants_kind_check
  CHECK (kind IS NULL OR kind IN ('winback', 'creator', 'affiliate', 'trial', 'referral', 'invite'));

-- The cold sequence. Created PAUSED with no trigger: invites are enrolled one by
-- one by the admin invites API, and nothing sends until Liz activates it.
INSERT INTO email_sequences (id, name, status, trigger, sends_per_hour, created_by, stream, track_opens)
VALUES (
  'f0e10001-0000-4000-a000-000000000001',
  'Invite: Foyer page (Instagram)',
  'paused',
  NULL,
  10,
  'elizabethdean30@gmail.com',
  'cold',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  (
    'f0e10001-0000-4000-a000-000000000001', 1, 0,
    'I made you a link-in-bio page, @{{INVITE_HANDLE}}',
    'Hi {{INVITE_FIRST_NAME}},

It is Liz from Influencer Butler. {{INVITE_OPENER}}

So I went ahead and built it for you. Here is your private preview (only someone with this link can see it):

{{INVITE_PREVIEW_URL}}

If you like it, one click makes it yours, along with 14 days of Influencer Butler Power User, free, no card. This is invite-only, so you will not find it on our website. {{CREATOR_COUNT}} creators already pay for Influencer Butler to handle their storefront busywork, and this page is the easiest place to start.

Not for you? No problem at all. The preview simply goes away on {{INVITE_EXPIRES}}.

Liz
Influencer Butler'
  ),
  (
    'f0e10001-0000-4000-a000-000000000001', 2, 3,
    'Your page is still saved, @{{INVITE_HANDLE}}',
    'Hi {{INVITE_FIRST_NAME}},

Liz again, with a quick follow-up on the page I made for you:

{{INVITE_PREVIEW_URL}}

Once you claim it, Influencer Butler can keep it fresh for you: daily deals in your niche, an email sign-up so you own your audience, and one link that works everywhere you post. You can change anything on it in a couple of clicks.

It is yours free for 14 days, no card.

Liz'
  ),
  (
    'f0e10001-0000-4000-a000-000000000001', 3, 7,
    'Last note about your page',
    'Hi {{INVITE_FIRST_NAME}},

Last email from me about this, promise. The page I built for @{{INVITE_HANDLE}} stays up until {{INVITE_EXPIRES}}:

{{INVITE_PREVIEW_URL}}

If now is not the right time, no worries. Thank you for the content you make.

Liz'
  )
ON CONFLICT (sequence_id, position) DO NOTHING;
