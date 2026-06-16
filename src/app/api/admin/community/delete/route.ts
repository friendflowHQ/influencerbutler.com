/**
 * POST /api/admin/community/delete
 * Body: { type: 'question' | 'answer', id: string }
 *
 * Hard-delete a question or answer. For questions, cascade rules on
 * community_answers + community_question_upvotes remove dependent rows.
 * For answers, the AFTER DELETE trigger decrements answer_count.
 *
 * This is destructive and irreversible — the admin UI prompts for
 * confirmation before calling it.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = { type?: string; id?: string };

type DeleteClient = {
  from: (table: string) => {
    delete: () => {
      eq: (col: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("community.delete", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type === "answer" ? "answer" : body.type === "question" ? "question" : null;
  const id = body.id?.trim();

  if (!type) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const table = type === "question" ? "community_questions" : "community_answers";

  const supabase = createAdminClient() as unknown as DeleteClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    console.error("admin community delete failed", error);
    return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "community.delete",
    targetType: type,
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
