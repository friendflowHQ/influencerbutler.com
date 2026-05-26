-- Skip moderation on Community Q&A: questions posted via /help/community/ask
-- now go live immediately. The admin page at /dashboard/admin/community
-- remains in place for post-hoc takedowns but the pending queue will
-- normally be empty.
--
-- This widens the insert RLS policy so signed-in users can create rows with
-- status='approved' (still must be their own author_id; 'rejected' is still
-- blocked). New rows also default to 'approved' if status isn't supplied.

ALTER TABLE community_questions
  ALTER COLUMN status SET DEFAULT 'approved';

DROP POLICY IF EXISTS "community_questions_authenticated_insert" ON community_questions;
CREATE POLICY "community_questions_authenticated_insert" ON community_questions
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND status IN ('pending', 'approved')
  );
