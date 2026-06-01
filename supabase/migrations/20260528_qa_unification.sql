-- Q&A unification: prep work for migrating Influencer Butler desktop app's
-- worker D1 questions into Supabase as the single source of truth.
--
-- 1. legacy_d1_id columns on community_questions + community_answers so the
--    one-time D1 -> Supabase migration script can be idempotent (re-runnable).
--    Worker D1 ids look like `q-<uuid>` / `qa-<uuid>` and won't collide with
--    Supabase native UUID ids.
--
-- 2. Owner-read RLS policies so authors can read their own non-approved rows
--    (defensive - given auto-approve we don't expect any non-approved
--    user-authored rows, but if an admin hides one we don't want the author
--    to lose access to their own content).
--
-- 3. Bump the public-read RLS to keep filtering on status='approved' (no
--    change in behavior - documenting the intent here so the owner-read
--    policy doesn't get misread as widening visibility).

-- ── (1) legacy_d1_id columns ───────────────────────────────────────────────

ALTER TABLE community_questions
  ADD COLUMN IF NOT EXISTS legacy_d1_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS community_questions_legacy_d1_id_idx
  ON community_questions (legacy_d1_id)
  WHERE legacy_d1_id IS NOT NULL;

ALTER TABLE community_answers
  ADD COLUMN IF NOT EXISTS legacy_d1_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS community_answers_legacy_d1_id_idx
  ON community_answers (legacy_d1_id)
  WHERE legacy_d1_id IS NOT NULL;

-- ── (2) Owner-read RLS policies ────────────────────────────────────────────

DROP POLICY IF EXISTS "community_questions_owner_read" ON community_questions;
CREATE POLICY "community_questions_owner_read" ON community_questions
  FOR SELECT USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "community_answers_owner_read" ON community_answers;
CREATE POLICY "community_answers_owner_read" ON community_answers
  FOR SELECT USING (auth.uid() = author_id);
