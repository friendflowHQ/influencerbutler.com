-- Threaded replies for community answers: one level of nesting.
-- NULL parent_answer_id = top-level answer; non-null = reply belonging to
-- that top-level answer's thread. Server code coerces replies-to-replies
-- onto the thread root, so every stored parent is itself top-level.
--
-- Replies count toward community_questions.answer_count (the recount
-- trigger is unchanged); deleting a parent answer cascades to its replies
-- and the per-row AFTER DELETE trigger keeps the count in sync.
--
-- NOTE: apply this in the Supabase SQL editor BEFORE deploying the code
-- that selects parent_answer_id (the question page reads the column).

ALTER TABLE community_answers
  ADD COLUMN IF NOT EXISTS parent_answer_id UUID
    REFERENCES community_answers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS community_answers_parent_answer_id_idx
  ON community_answers (parent_answer_id)
  WHERE parent_answer_id IS NOT NULL;
