/**
 * /api/help/questions/[id]/answers - post an answer on a question. Auth
 * is dual-mode:
 *   - Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *   - Supabase session cookie                (website browser)
 *
 * Answers are auto-approved (status='approved' on insert); the question's
 * answer_count is kept in sync by a Postgres trigger.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { resolveAuth } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_MAX = 8000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

type AdminInsertClient = {
  from: (table: string) => {
    insert: (
      payload: Record<string, unknown>,
    ) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

type PostBody = { body?: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: questionId } = await params;
  if (!questionId || !UUID_RE.test(questionId)) {
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

  const authResult = await resolveAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }
  const { auth } = authResult;

  const admin = createAdminClient() as unknown as AdminInsertClient | null;
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const { data: inserted, error } = await admin
    .from("community_answers")
    .insert({
      question_id: questionId,
      body,
      status: "approved",
      approved_at: new Date().toISOString(),
      author_id: auth.userId,
      author_email: auth.email,
    })
    .select("id")
    .single();

  if (error) {
    console.error("community_answers insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not post answer." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
