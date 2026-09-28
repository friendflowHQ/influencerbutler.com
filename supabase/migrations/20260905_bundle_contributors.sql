-- Grow Together Creator Bundle: contributor roster.
--
-- A collaborative creator bundle. Creators apply at /grow-together, claim a
-- chapter topic, and each write one chapter; the finished PDF is given away to
-- readers, and everyone cross-promotes it during launch week. This table is the
-- roster the admin tracker (/dashboard/admin/bundle) reads and updates.
--
-- Capacity per topic is enforced in the apply API (it counts existing rows), not
-- by a DB constraint, so topics can hold more than one contributor. One row per
-- person per bundle (unique bundle_slug + email); re-applying is rejected.
--
-- RLS is ON with NO public policy: reads/writes go through the service-role
-- client from admin-gated routes (see src/lib/admin.ts createAdminClient). The
-- public apply route also uses the service role. This mirrors how the other
-- lead tables are protected (see project-subscriptions-rls-no-select).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor. Idempotent (IF NOT EXISTS). Every consumer degrades
-- gracefully when the table is missing, so shipping the code first is safe.

CREATE TABLE IF NOT EXISTS bundle_contributors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_slug      text NOT NULL DEFAULT 'grow-together',
  name             text NOT NULL,
  email            text NOT NULL,
  instagram_handle text,
  other_socials    jsonb,
  website          text,
  topic            text NOT NULL,
  chapter_title    text,
  bio              text,
  headshot_url     text,
  audience_size    text,
  -- applied -> confirmed -> submitted -> scheduled -> done, or declined.
  status           text NOT NULL DEFAULT 'applied',
  chapter_url      text,
  promo_committed  boolean NOT NULL DEFAULT false,
  submitted_at     timestamptz,
  notes            text,
  -- Structured chapter submission, captured on-site via the signed submit link
  -- (/grow-together/submit). Filled when a contributor submits; NULL until then.
  -- Modeled on the original Live Sweet contributor brief so the whole bundle is
  -- export-ready for assembling the PDF.
  handles_to_include text,   -- which social handles to print with their chapter
  intro_earn         text,   -- how they make money online
  intro_inspired     text,   -- what inspired them to go down this path
  intro_love         text,   -- what they love most about what they do
  chapter_body       text,   -- the chapter itself, on their topic
  conclude_question  text,   -- which closing prompt they chose (see bundleMeta.ts)
  conclude_answer    text,   -- their answer to it
  cta_text           text,   -- optional call to action / link for their chapter
  submitted_via      text,   -- 'portal' once submitted through the form
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One application per person per bundle. A case-insensitive email guard: the
-- apply route always lowercases before insert, and this index enforces it.
CREATE UNIQUE INDEX IF NOT EXISTS bundle_contributors_bundle_email_idx
  ON bundle_contributors (bundle_slug, lower(email));

-- Fast "who claimed this topic" counts for the availability endpoint + admin.
CREATE INDEX IF NOT EXISTS bundle_contributors_topic_idx
  ON bundle_contributors (bundle_slug, topic);

CREATE INDEX IF NOT EXISTS bundle_contributors_status_idx
  ON bundle_contributors (bundle_slug, status);

ALTER TABLE bundle_contributors ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (admin routes + apply route)
-- may read or write. RLS with no policy denies all anon/authenticated access.
