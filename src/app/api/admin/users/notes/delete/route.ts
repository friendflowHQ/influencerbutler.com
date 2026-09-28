/**
 * POST /api/admin/users/notes/delete { noteId }
 *
 * Hard-delete one internal admin note. Gated by users.notes.edit; the note's
 * target user is read first so the deletion is audited against that user.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(request: Request) {
  const actor = await requirePermission("users.notes.edit", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { noteId?: unknown };
  try {
    body = (await request.json()) as { noteId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const noteId = str(body.noteId);
  if (!noteId || !UUID_RE.test(noteId)) {
    return NextResponse.json({ error: "A valid noteId is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = adminClient as unknown as Db;

  const { data: existing, error: readErr } = await db
    .from("user_notes")
    .select("id,user_id")
    .eq("id", noteId)
    .maybeSingle();
  if (readErr) {
    console.error("users/notes delete: read failed", readErr);
    return NextResponse.json({ error: "Note lookup failed." }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  const { error } = await db.from("user_notes").delete().eq("id", noteId);
  if (error) {
    console.error("users/notes delete: delete failed", error);
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "users.note.delete",
    targetType: "user",
    targetId: str(existing.user_id) ?? noteId,
    details: { noteId },
  });

  return NextResponse.json({ ok: true });
}
