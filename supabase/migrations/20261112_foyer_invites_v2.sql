-- Foyer page pilot v2: Storefront Score + four individually written emails.
--
-- Changes on top of 20261111_foyer_invites.sql:
--   * per-creator emails: email_steps holds [{subject, body}] written for that
--     creator (Claude writes them; Liz approves each batch). The shared
--     sequence steps are now just {{INVITE_SUBJECT_n}} / {{INVITE_BODY_n}}
--     slots at days 0, 3, 7, 14, plus two monthly "your score changed" slots
--     (days 44 and 74) that HOLD until a body for that step is written;
--   * the Storefront Score (score) and the storefront URL it was read from;
--   * page tracking: time on page, claim click, reply, removal;
--   * "Remove my page" (status removed): the content is deleted right away, so
--     page_doc / preview_html become nullable.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20261111_foyer_invites.sql. Idempotent.

ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS email_steps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS score JSONB;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS storefront_url TEXT NOT NULL DEFAULT '';
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS time_on_page_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS claim_clicked_at TIMESTAMPTZ;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS content_deleted_at TIMESTAMPTZ;

ALTER TABLE foyer_invites ALTER COLUMN page_doc DROP NOT NULL;
ALTER TABLE foyer_invites ALTER COLUMN preview_html DROP NOT NULL;

ALTER TABLE foyer_invites DROP CONSTRAINT IF EXISTS foyer_invites_status_check;
ALTER TABLE foyer_invites
  ADD CONSTRAINT foyer_invites_status_check
  CHECK (status IN ('drafted','sent','viewed','claimed','activated','published','converted','declined','replied','removed'));

-- Replace the shared-copy steps with per-creator slots. Safe to re-run: the
-- sequence was seeded paused, and nothing should be enrolled before v2.
DELETE FROM email_sequence_steps WHERE sequence_id = 'f0e10001-0000-4000-a000-000000000001';
INSERT INTO email_sequence_steps (sequence_id, position, day_offset, subject, body)
VALUES
  ('f0e10001-0000-4000-a000-000000000001', 1, 0,  '{{INVITE_SUBJECT_1}}', '{{INVITE_BODY_1}}'),
  ('f0e10001-0000-4000-a000-000000000001', 2, 3,  '{{INVITE_SUBJECT_2}}', '{{INVITE_BODY_2}}'),
  ('f0e10001-0000-4000-a000-000000000001', 3, 7,  '{{INVITE_SUBJECT_3}}', '{{INVITE_BODY_3}}'),
  ('f0e10001-0000-4000-a000-000000000001', 4, 14, '{{INVITE_SUBJECT_4}}', '{{INVITE_BODY_4}}'),
  ('f0e10001-0000-4000-a000-000000000001', 5, 44, '{{INVITE_SUBJECT_5}}', '{{INVITE_BODY_5}}'),
  ('f0e10001-0000-4000-a000-000000000001', 6, 74, '{{INVITE_SUBJECT_6}}', '{{INVITE_BODY_6}}')
ON CONFLICT (sequence_id, position) DO NOTHING;

UPDATE email_sequences
  SET name = 'Invite: Storefront Score (Instagram)', sends_per_hour = 5
  WHERE id = 'f0e10001-0000-4000-a000-000000000001';
