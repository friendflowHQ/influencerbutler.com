/**
 * POST /api/admin/community/respond - post a community answer (or threaded
 * reply) as the site owner. Used by the scheduled auto-responder task, which
 * has no browser session, so auth is the cron-route CRON_SECRET bearer
 * pattern (fails closed when the secret is unset).
 *
 * Body: { questionId, body, parentAnswerId? }
 *  - parentAnswerId nests the answer as a reply and emails that answer's
 *    author, exactly like the public reply flow (shared helper).
 *  - Rejects bodies containing an em dash (U+2014) so the task self-corrects
 *    per the site style rule.
 *  - Idempotency: if the latest approved answer is already by the responder
 *    and less than 6 hours old, returns skipped instead of double-posting.
 */
import { NextResponse } from "next/server";
import { createAdminClient, isEmailAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  loadQuestionForNotify,
  notifyCommunityAnswer,
  resolveParentAnswer,
} from "@/lib/community-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = "https://www.influencerbutler.com";
const BODY_MAX = 8000;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const ALREADY_RESPONDED_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RESPONDER_EMAIL = "elizabethdean30@gmail.com";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("community respond: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type ProfileRow = { id: string; display_name: string | null };
type LatestAnswerRow = { id: string; author_email: string | null; created_at: string };

type RespondClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
        eq: (col: string, value: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: LatestAnswerRow[] | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
      ilike: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: ProfileRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

type PostBody = { questionId?: string; body?: string; parentAnswerId?: string };

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PostBody;
  try {
    payload = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const questionId = payload.questionId?.trim() ?? "";
  if (!UUID_RE.test(questionId)) {
    return NextResponse.json({ ok: false, error: "Bad question id" }, { status: 400 });
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
  if (body.includes(String.fromCharCode(0x2014))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Body contains an em dash (U+2014), which is not allowed in site copy. Rewrite with a comma, colon, or hyphen and retry.",
      },
      { status: 400 },
    );
  }

  const parentAnswerId = payload.parentAnswerId?.trim() || null;
  if (parentAnswerId && !UUID_RE.test(parentAnswerId)) {
    return NextResponse.json({ ok: false, error: "Bad parent answer id" }, { status: 400 });
  }

  const responderEmail =
    process.env.COMMUNITY_RESPONDER_EMAIL || DEFAULT_RESPONDER_EMAIL;
  if (!isEmailAdmin(responderEmail)) {
    console.error("community respond: responder email is not in ADMIN_EMAILS");
    return NextResponse.json(
      { ok: false, error: "Responder email is not an admin" },
      { status: 500 },
    );
  }

  const admin = createAdminClient() as unknown as RespondClient | null;
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  // Resolve the responder's user id (and display name) from profiles.
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, display_name")
    .ilike("email", responderEmail)
    .maybeSingle();
  if (pErr || !profile) {
    console.error("community respond: responder profile not found", pErr);
    return NextResponse.json(
      { ok: false, error: "Responder profile not found" },
      { status: 500 },
    );
  }

  // The question must exist and be approved.
  const question = await loadQuestionForNotify(questionId);
  if (!question) {
    return NextResponse.json({ ok: false, error: "Question not found" }, { status: 404 });
  }

  // Idempotency guard: if the responder already posted the latest answer
  // recently, a second run (overlap/retry) should not double-post.
  const { data: latestRows, error: lErr } = await admin
    .from("community_answers")
    .select("id, author_email, created_at")
    .eq("question_id", questionId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);
  if (lErr) {
    console.error("community respond: latest answer query failed", lErr);
    return NextResponse.json({ ok: false, error: "Query failed" }, { status: 500 });
  }
  const latest = latestRows?.[0] ?? null;
  if (
    latest &&
    (latest.author_email ?? "").toLowerCase() === responderEmail.toLowerCase() &&
    Date.now() - new Date(latest.created_at).getTime() < ALREADY_RESPONDED_WINDOW_MS
  ) {
    return NextResponse.json({
      ok: true,
      skipped: "already-responded",
      answerId: latest.id,
      url: `${SITE_URL}/help/community/${questionId}`,
    });
  }

  // Validate + coerce the reply target (same helper as the public route).
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

  const { data: inserted, error: iErr } = await admin
    .from("community_answers")
    .insert({
      question_id: questionId,
      body,
      status: "approved",
      approved_at: new Date().toISOString(),
      author_id: profile.id,
      author_email: responderEmail,
      parent_answer_id: storageParentId,
    })
    .select("id")
    .single();
  if (iErr || !inserted) {
    console.error("community respond: insert failed", iErr);
    return NextResponse.json(
      { ok: false, error: "Could not post answer." },
      { status: 500 },
    );
  }

  // Awaited (unlike the public route's after()) so the machine caller gets a
  // deterministic report of who was notified.
  const notified = await notifyCommunityAnswer({
    questionId,
    questionTitle: question.title,
    questionAuthorEmail: question.author_email,
    posterEmail: responderEmail,
    posterName: profile.display_name || "Liz Dean",
    answerBody: body,
    repliedToEmail,
  });

  await logAdminAction({
    actor: { userId: profile.id, email: responderEmail, role: "admin" },
    action: "community.autorespond",
    targetType: "community_answer",
    targetId: inserted.id,
    details: { questionId, parentAnswerId, via: "scheduled-task" },
  });

  return NextResponse.json({
    ok: true,
    answerId: inserted.id,
    notified,
    url: `${SITE_URL}/help/community/${questionId}`,
  });
}
