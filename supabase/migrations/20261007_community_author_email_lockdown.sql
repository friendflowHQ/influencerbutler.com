-- SECURITY: community_questions.author_email and community_answers.author_email
-- were readable by the public anon key. The public SELECT policies
-- ("status = 'approved'") are row-level only, so every approved row exposed the
-- poster's email address to anyone who called the Supabase REST API directly.
--
-- Fix: column-level privileges. A column REVOKE is a no-op while the role holds
-- a TABLE-level SELECT grant (Supabase grants it by default), so we revoke the
-- table-level grant and re-grant SELECT on every column EXCEPT author_email.
-- Written dynamically so columns added by later migrations (legacy_d1_id,
-- parent_answer_id, ...) are included.
--
-- Server code that needs the email (admin moderation, reply notifications)
-- uses the service-role client, which is unaffected. The public pages and
-- /api/help/questions routes no longer select author_email (see the matching
-- commit). Any future column added to these tables must be GRANTed SELECT to
-- anon/authenticated explicitly if the public pages should read it.
--
-- NOT applied automatically: run by hand in the Supabase SQL editor AFTER the
-- site code that stops selecting author_email has been deployed.

DO $$
DECLARE
  tbl  TEXT;
  cols TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['community_questions', 'community_answers'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = tbl
       AND column_name <> 'author_email';

    IF cols IS NULL THEN
      RAISE NOTICE 'table public.% not found, skipping', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon, authenticated', cols, tbl);
  END LOOP;
END
$$;

-- client_action_totals is a plain view (runs with its owner's rights, so it
-- bypasses the base table's RLS) and Supabase grants new public views to anon.
-- It is only read through the service-role client; close the public read.
DO $$
BEGIN
  IF to_regclass('public.client_action_totals') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.client_action_totals FROM anon, authenticated';
  END IF;
END
$$;
