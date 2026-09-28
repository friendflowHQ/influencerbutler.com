/**
 * /api/help/questions/[id]/answers - post an answer on a question. Auth
 * is dual-mode:
 *   - Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *   - Supabase session cookie                (website browser)
 *
 * Answers are auto-approved (status='approved' on insert); the question's
 * answer_count is kept in sync by a Postgres trigger.
 *
 * An optional parentAnswerId turns the answer into a threaded reply (one
 * level deep; replies to replies attach to the thread root). Posting
 * notifies the replied-to author and the question author by email; the
 * sends run in after() so the response returns immediately.
 */
import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { resolveAuth } from "@/lib/license-auth";
import { resolveCommunityAuthors } from "@/lib/community-authors";
import {
  loadQuestionForNotify,
  notifyCommunityAnswer,
  resolveParentAnswer,
} from "@/lib/community-notify";

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

type PostBody = { body?: string; parentAnswerId?: string };

async function posterDisplayName(
  userId: string | null,
  email: string | null,
): Promise<string> {
  if (userId) {
    const authors = await resolveCommunityAuthors([userId]);
    const author = authors.get(userId);
    const name = author?.display_name || author?.username;
    if (name) return name;
  }
  if (email && email.includes("@")) return email.split("@")[0];
  return "A community member";
}

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

  const parentAnswerId = payload.parentAnswerId?.trim() || null;
  if (parentAnswerId && !UUID_RE.test(parentAnswerId)) {
    return NextResponse.json({ ok: false, error: "Bad parent answer id" }, { status: 400 });
  }

  const authResult = await resolveAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }
  const { auth } = authResult;

  // When this is a reply, validate the target and coerce nesting to one
  // level: the stored parent is always a top-level answer.
  let storageParentId: string | null = null;
  let repliedToEmail: string | null = null;
  if (parentAnswerId) {
    const parent = await resolveParentAnswer(questionId, parentAnswerId);
    if (!parent.ok) {
      return NextResponse.json({ ok: false, error: parent.error }, { status: 400 });
    }
    storageParentId = parent.storageParentId;
    repliedToEmail = parent.referenced.author_email;
  }

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
      parent_answer_id: storageParentId,
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

  after(async () => {
    try {
      const question = await loadQuestionForNotify(questionId);
      if (!question) return;
      const posterName = await posterDisplayName(auth.userId, auth.email ?? null);
      await notifyCommunityAnswer({
        questionId,
        questionTitle: question.title,
        questionAuthorEmail: question.author_email,
        posterEmail: auth.email ?? null,
        posterName,
        answerBody: body,
        repliedToEmail,
      });
    } catch (err) {
      console.error("community answer notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
