/**
 * GET /api/help/questions/[id] - public detail view of a single
 * community question. Returns the question + its approved answers with
 * author profile metadata enriched in one round-trip.
 *
 * The website's /help/community/[id] page reads from Supabase directly,
 * so this endpoint exists primarily to serve the Influencer Butler
 * desktop app which doesn't have a Supabase client.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  upvotes: number | null;
  answer_count: number | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  body: string;
  author_id: string | null;
  author_email: string | null;
  parent_answer_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type DetailClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        single: () => Promise<{ data: QuestionRow | null; error: { message?: string } | null }>;
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: AnswerRow[] | null;
          error: { message?: string } | null;
        }>;
      };
      in: (col: string, values: string[]) => Promise<{
        data: ProfileRow[] | null;
        error: unknown;
      }>;
    };
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  const supabase = (await createClient()) as unknown as DetailClient;

  const { data: question, error: qErr } = await supabase
    .from("community_questions")
    .select(
      "id, workspace_id, title, body, upvotes, answer_count, author_id, author_email, created_at",
    )
    .eq("id", id)
    .single();
  if (qErr || !question) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: answers } = await supabase
    .from("community_answers")
    .select("id, question_id, body, author_id, author_email, parent_answer_id, created_at")
    .eq("question_id", id)
    .order("created_at", { ascending: true });

  const allAnswers = answers ?? [];

  const authorIds = Array.from(
    new Set(
      [question.author_id, ...allAnswers.map((a) => a.author_id)].filter(
        (v): v is string => !!v,
      ),
    ),
  );
  const authorMap = new Map<string, ProfileRow>();
  if (authorIds.length > 0) {
    const admin = createAdminClient() as unknown as DetailClient | null;
    if (admin) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", authorIds);
      for (const p of profiles || []) authorMap.set(p.id, p);
    }
  }

  const authorFor = (id: string | null) =>
    id && authorMap.has(id)
      ? {
          display_name: authorMap.get(id)!.display_name,
          username: authorMap.get(id)!.username,
          avatar_url: authorMap.get(id)!.avatar_url,
        }
      : null;

  return NextResponse.json({
    ok: true,
    question: {
      id: question.id,
      workspaceId: question.workspace_id,
      title: question.title,
      body: question.body || "",
      upvotes: Number(question.upvotes || 0),
      answerCount: Number(question.answer_count || 0),
      author: authorFor(question.author_id),
      createdAt: question.created_at,
    },
    answers: allAnswers.map((a) => ({
      id: a.id,
      body: a.body,
      author: authorFor(a.author_id),
      parentAnswerId: a.parent_answer_id ?? null,
      createdAt: a.created_at,
    })),
  });
}
