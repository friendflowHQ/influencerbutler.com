/**
 * GET /api/admin/community/inbox - the "needs a response" feed for the
 * scheduled community auto-responder. Returns approved questions that are
 * either unanswered or whose latest approved answer came from a community
 * member (not an ADMIN_EMAILS address), with full bodies and per-answer
 * author emails so the responder can read the whole thread.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>. There is no session on the
 * caller (a scheduled task), so this follows the cron-route pattern and
 * fails closed when CRON_SECRET is unset.
 */
import { NextResponse } from "next/server";
import { createAdminClient, isEmailAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = "https://www.influencerbutler.com";
const LIMIT_DEFAULT = 25;
const LIMIT_MAX = 50;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("community inbox: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  author_id: string | null;
  author_email: string | null;
  answer_count: number | null;
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

type InboxClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: QuestionRow[] | null;
            error: { message?: string } | null;
          }>;
        };
        in: (col: string, values: string[]) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{
            data: AnswerRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? LIMIT_DEFAULT);
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : LIMIT_DEFAULT, 1),
    LIMIT_MAX,
  );

  const admin = createAdminClient() as unknown as InboxClient | null;
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: questions, error: qErr } = await admin
    .from("community_questions")
    .select(
      "id, workspace_id, title, body, author_id, author_email, answer_count, created_at",
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (qErr) {
    console.error("community inbox: questions query failed", qErr);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const questionRows = questions ?? [];
  const answersByQuestion = new Map<string, AnswerRow[]>();
  if (questionRows.length > 0) {
    const { data: answers, error: aErr } = await admin
      .from("community_answers")
      .select(
        "id, question_id, body, author_id, author_email, parent_answer_id, created_at",
      )
      .eq("status", "approved")
      .in("question_id", questionRows.map((q) => q.id))
      .order("created_at", { ascending: true });
    if (aErr) {
      console.error("community inbox: answers query failed", aErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    for (const a of answers ?? []) {
      const list = answersByQuestion.get(a.question_id) ?? [];
      list.push(a);
      answersByQuestion.set(a.question_id, list);
    }
  }

  const needsResponse = questionRows.flatMap((q) => {
    const answers = answersByQuestion.get(q.id) ?? [];
    const latest = answers.length > 0 ? answers[answers.length - 1] : null;
    const latestIsAdmin = latest ? isEmailAdmin(latest.author_email) : false;

    let reason: "unanswered" | "follow_up" | null = null;
    if (!latest) reason = "unanswered";
    else if (!latestIsAdmin) reason = "follow_up";
    if (!reason) return [];

    return [
      {
        id: q.id,
        url: `${SITE_URL}/help/community/${q.id}`,
        workspace_id: q.workspace_id,
        title: q.title,
        body: q.body ?? "",
        author_email: q.author_email,
        created_at: q.created_at,
        reason,
        latest_answer: latest
          ? {
              id: latest.id,
              author_email: latest.author_email,
              is_admin: latestIsAdmin,
              created_at: latest.created_at,
            }
          : null,
        answers: answers.map((a) => ({
          id: a.id,
          body: a.body,
          author_email: a.author_email,
          is_admin: isEmailAdmin(a.author_email),
          parent_answer_id: a.parent_answer_id,
          created_at: a.created_at,
        })),
      },
    ];
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: needsResponse.length,
    questions: needsResponse,
  });
}
