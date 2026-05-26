/**
 * /api/help/questions/[id]/answers - post an answer on a question. Auth
 * is enforced via the Supabase session cookie. Answers are auto-approved
 * (status='approved' on insert); the question's answer_count is kept in
 * sync by a Postgres trigger.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_MAX = 8000;

type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    insert: (
      payload: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
  };
};

type PostBody = { body?: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: questionId } = await params;
  if (!questionId || !/^[0-9a-f-]{36}$/i.test(questionId)) {
    return NextResponse.json({ ok: false, error: "Bad question id" }, { status: 400 });
  }

  let payload: PostBody;
  try {
    payload = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const body = (payload.body ?? "").trim();
  if (!body) {
    return NextResponse.json({ ok: false, error: "Answer can't be empty." }, { status: 400 });
  }
  if (body.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Answer too long (max ${BODY_MAX} chars).` },
      { status: 400 },
    );
  }

  const supabase = (await createClient()) as unknown as AuthClient;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in required to answer." },
      { status: 401 },
    );
  }

  const { error } = await supabase
    .from("community_answers")
    .insert({
      question_id: questionId,
      body,
      status: "approved",
      approved_at: new Date().toISOString(),
      author_id: userData.user.id,
      author_email: userData.user.email ?? null,
    });

  if (error) {
    console.error("community_answers insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not post answer." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
