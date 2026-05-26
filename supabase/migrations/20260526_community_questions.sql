-- Community Q&A storage. Backs /help/community (public listing) and
-- /help/community/ask (sign-in-gated post). Moderation lives in
-- /dashboard/admin/community and uses the service-role client to bypass RLS.
--
-- Statuses:
--   pending  - just submitted, not visible publicly
--   approved - visible on /help/community
--   rejected - kept for audit, never visible publicly

CREATE TABLE IF NOT EXISTS community_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT,
  upvotes INTEGER NOT NULL DEFAULT 0,
  answer_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS community_questions_status_created_at_idx
  ON community_questions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS community_questions_workspace_id_idx
  ON community_questions (workspace_id);

ALTER TABLE community_questions ENABLE ROW LEVEL SECURITY;

-- Anyone (signed in or anonymous) can read approved questions.
DROP POLICY IF EXISTS "community_questions_public_read" ON community_questions;
CREATE POLICY "community_questions_public_read" ON community_questions
  FOR SELECT USING (status = 'approved');

-- Signed-in users can post a question as themselves, and only with the
-- pending status. Approval transitions happen via the service-role client.
DROP POLICY IF EXISTS "community_questions_authenticated_insert" ON community_questions;
CREATE POLICY "community_questions_authenticated_insert" ON community_questions
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND status = 'pending'
  );
