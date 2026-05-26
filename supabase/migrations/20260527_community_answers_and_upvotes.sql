-- Community Q&A: answers + upvotes.
--
-- community_answers backs /help/community/[id] (one per row, oldest first).
-- community_question_upvotes records one row per (question, user); the
-- aggregate count lives denormalized on community_questions.upvotes so the
-- listing page doesn't have to JOIN.
--
-- Two AFTER triggers keep the denormalized counts (upvotes, answer_count)
-- in sync with their detail tables. SECURITY DEFINER so the trigger can
-- update community_questions even when the row owner is someone else.

CREATE TABLE IF NOT EXISTS community_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_answers_question_id_created_at_idx
  ON community_answers (question_id, created_at ASC);

ALTER TABLE community_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_answers_public_read" ON community_answers;
CREATE POLICY "community_answers_public_read" ON community_answers
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "community_answers_authenticated_insert" ON community_answers;
CREATE POLICY "community_answers_authenticated_insert" ON community_answers
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND status IN ('pending', 'approved')
  );


CREATE TABLE IF NOT EXISTS community_question_upvotes (
  question_id UUID NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

ALTER TABLE community_question_upvotes ENABLE ROW LEVEL SECURITY;

-- Users can see their own upvotes (so the detail page can show the
-- "you've upvoted this" state); the public count lives on
-- community_questions.upvotes.
DROP POLICY IF EXISTS "community_question_upvotes_own_read" ON community_question_upvotes;
CREATE POLICY "community_question_upvotes_own_read" ON community_question_upvotes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_question_upvotes_own_insert" ON community_question_upvotes;
CREATE POLICY "community_question_upvotes_own_insert" ON community_question_upvotes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_question_upvotes_own_delete" ON community_question_upvotes;
CREATE POLICY "community_question_upvotes_own_delete" ON community_question_upvotes
  FOR DELETE USING (auth.uid() = user_id);


CREATE OR REPLACE FUNCTION community_questions_recount_upvotes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE community_questions
      SET upvotes = COALESCE(upvotes, 0) + 1
      WHERE id = NEW.question_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE community_questions
      SET upvotes = GREATEST(COALESCE(upvotes, 0) - 1, 0)
      WHERE id = OLD.question_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS community_question_upvotes_count_trg ON community_question_upvotes;
CREATE TRIGGER community_question_upvotes_count_trg
  AFTER INSERT OR DELETE ON community_question_upvotes
  FOR EACH ROW EXECUTE FUNCTION community_questions_recount_upvotes();


CREATE OR REPLACE FUNCTION community_questions_recount_answers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'approved' THEN
      UPDATE community_questions
        SET answer_count = COALESCE(answer_count, 0) + 1
        WHERE id = NEW.question_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'approved' THEN
      UPDATE community_questions
        SET answer_count = GREATEST(COALESCE(answer_count, 0) - 1, 0)
        WHERE id = OLD.question_id;
    END IF;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Status flipped between approved and not-approved.
    IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
      UPDATE community_questions
        SET answer_count = COALESCE(answer_count, 0) + 1
        WHERE id = NEW.question_id;
    ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
      UPDATE community_questions
        SET answer_count = GREATEST(COALESCE(answer_count, 0) - 1, 0)
        WHERE id = NEW.question_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS community_answers_count_trg ON community_answers;
CREATE TRIGGER community_answers_count_trg
  AFTER INSERT OR UPDATE OR DELETE ON community_answers
  FOR EACH ROW EXECUTE FUNCTION community_questions_recount_answers();
