/**
 * /api/help/questions/[id]/upvote - toggle the current user's upvote on a
 * question. POST flips state: if no row exists in community_question_upvotes
 * for (question_id, user_id), insert one; otherwise delete it. A trigger
 * keeps community_questions.upvotes in sync.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Result<T> = { data: T | null; error: { message?: string } | null };

// Shape returned after .select(...).eq(col, value). Supports both the
// 2-eq chain (used to check whether the user has already upvoted) and
// the 1-eq chain (used to read the denormalized upvote count).
type ChainAfterFirstEq = {
  eq: (col: string, value: string) => {
    maybeSingle: () => Promise<Result<Record<string, unknown>>>;
  };
  single: () => Promise<Result<{ upvotes: number | null }>>;
};

type UpvoteClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string } | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => ChainAfterFirstEq;
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: questionId } = await params;
  if (!questionId || !/^[0-9a-f-]{36}$/i.test(questionId)) {
    return NextResponse.json({ ok: false, error: "Bad question id" }, { status: 400 });
  }

  const supabase = (await createClient()) as unknown as UpvoteClient;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in required to upvote." },
      { status: 401 },
    );
  }
  const userId = userData.user.id;

  // Check current state (RLS lets the user see only their own row).
  const { data: existing } = await supabase
    .from("community_question_upvotes")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  let upvoted: boolean;
  if (existing) {
    const { error } = await supabase
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
    const { error } = await supabase
      .from("community_question_upvotes")
      .insert({ question_id: questionId, user_id: userId });
    if (error) {
      console.error("upvote insert failed", error);
      return NextResponse.json({ ok: false, error: "Could not upvote." }, { status: 500 });
    }
    upvoted = true;
  }

  // Read the freshly-updated count back from the denormalized field.
  const { data: counts } = await supabase
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
