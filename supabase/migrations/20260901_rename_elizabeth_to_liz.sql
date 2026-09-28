-- Rename the founder sign-off in already-seeded sequence copy from "Elizabeth"
-- to "Liz" (her actual name). The original seed migrations
-- (20260828_instagram_posse_sequences.sql and
-- 20260901_cold_amazon_influencer_sequences.sql) use ON CONFLICT DO NOTHING, so
-- editing them does NOT touch rows already inserted into prod. This fixes those
-- rows in place.
--
-- Scoped to the four seeded sequences (Posse VIP/community + cold IG/TikTok) so
-- it can never rewrite unrelated user-authored copy. Idempotent: REPLACE is a
-- no-op once "Elizabeth" is gone, and re-running is safe.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor.

UPDATE email_sequence_steps
SET
  subject = REPLACE(subject, 'Elizabeth', 'Liz'),
  body    = REPLACE(body, 'Elizabeth', 'Liz')
WHERE sequence_id IN (
  '1a5e0001-0000-4000-a000-000000000001',  -- Instagram Posse VIP
  '1a5e0002-0000-4000-a000-000000000002',  -- Instagram Posse (community)
  '1a5e0003-0000-4000-a000-000000000003',  -- Cold Leads: Instagram (Amazon influencers)
  '1a5e0004-0000-4000-a000-000000000004'   -- Cold Leads: TikTok (Amazon influencers)
)
AND (subject LIKE '%Elizabeth%' OR body LIKE '%Elizabeth%');
