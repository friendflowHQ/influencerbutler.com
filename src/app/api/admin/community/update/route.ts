/**
 * POST /api/admin/community/update
 * Body: { type: 'question' | 'answer', id: string, status: 'approved' | 'pending' | 'rejected' }
 *
 * Polymorphic admin status flip — used by the moderation page to hide
 * (status='rejected') or restore (status='approved') either questions or
 * answers. The trigger on community_answers keeps the parent question's
 * answer_count in sync when an answer flips in or out of 'approved'.
 */
import { NextResponse } from "next/server";
import { getAdminSession, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateBody = {
  type?: string;
  id?: string;
  status?: string;
};

type UpdateClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type === "answer" ? "answer" : body.type === "question" ? "question" : null;
  const id = body.id?.trim();
  const status =
    body.status === "approved" || body.status === "rejected" || body.status === "pending"
      ? body.status
      : null;

  if (!type) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (!status) return NextResponse.json({ error: "Bad status" }, { status: 400 });

  const table = type === "question" ? "community_questions" : "community_answers";
  const payload: Record<string, unknown> = { status };
  // Stamp approved_at when transitioning to approved (idempotent on repeated approves).
  if (status === "approved") payload.approved_at = new Date().toISOString();

  const supabase = createAdminClient() as unknown as UpdateClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) {
    console.error("admin community update failed", error);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
