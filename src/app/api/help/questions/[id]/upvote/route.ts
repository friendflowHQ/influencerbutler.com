/**
 * /api/help/questions/[id]/upvote - toggle the caller's upvote on a
 * question. Auth is dual-mode:
 *   - Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *   - Supabase session cookie                (website browser)
 *
 * POST flips state: if no row exists in community_question_upvotes
 * for (question_id, user_id), insert one; otherwise delete it. A trigger
 * keeps community_questions.upvotes in sync.
 *
 * Writes go through the service-role client because license-bearer
 * callers have no session and so can't satisfy auth.uid() = user_id RLS.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { resolveAuth } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type UpvoteClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message?: string } | null;
          }>;
        };
        single: () => Promise<{
          data: { upvotes: number | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
    insert: (
      payload: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
    delete: () => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => Promise<{
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: questionId } = await params;
  if (!questionId || !UUID_RE.test(questionId)) {
    return NextResponse.json({ ok: false, error: "Bad question id" }, { status: 400 });
  }

  const authResult = await resolveAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }
  const { auth } = authResult;
  const userId = auth.userId;

  const admin = createAdminClient() as unknown as UpvoteClient | null;
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  // Check current state.
  const { data: existing } = await admin
    .from("community_question_upvotes")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  let upvoted: boolean;
  if (existing) {
    const { error } = await admin
      .from("community_question_upvotes")
      .delete()
      .eq("question_id", questionId)
      .eq("user_id", userId);
    if (error) {
      console.error("upvote delete failed", error);
      return NextResponse.json({ ok: false, error: "Could not unvote." }, { status: 500 });
    }
    upvoted = false;
  } else {
    const { error } = await admin
      .from("community_question_upvotes")
      .insert({ question_id: questionId, user_id: userId });
    if (error) {
      console.error("upvote insert failed", error);
      return NextResponse.json({ ok: false, error: "Could not upvote." }, { status: 500 });
    }
    upvoted = true;
  }

  // Read the freshly-updated count back from the denormalized field.
  const { data: counts } = await admin
    .from("community_questions")
    .select("upvotes")
    .eq("id", questionId)
    .single();

  return NextResponse.json({
    ok: true,
    upvoted,
    upvotes: counts?.upvotes ?? 0,
  });
}
