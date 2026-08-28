/**
 * Internal admin note log for a user account.
 *
 *   GET  ?userId=<uuid>   -> list notes, newest first (users.notes.view)
 *   POST { userId, body } -> add a note                (users.notes.edit)
 *
 * Notes are admin-only (the user_notes table has RLS on with no end-user policy),
 * so every read/write goes through the service-role client. The table lives on a
 * manual-apply migration that can lag prod, so reads are best-effort: a missing
 * table yields an empty list rather than a 500.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4000;

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      };
    };
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function GET(request: Request) {
  const actor = await requirePermission("users.notes.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "A valid userId is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = adminClient as unknown as Db;

  const { data, error } = await db
    .from("user_notes")
    .select("id,body,created_by,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    // Best-effort: a lagging prod schema (table not applied) shouldn't 500 the
    // Users page. Surface an empty list + a flag the UI can hint on.
    console.error("users/notes GET: read failed", error);
    return NextResponse.json({ notes: [], migrationPending: true });
  }

  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(request: Request) {
  const actor = await requirePermission("users.notes.edit", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { userId?: unknown; body?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown; body?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = str(body.userId);
  const text = str(body.body);
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "A valid userId is required." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Note body is required." }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `Note is too long (max ${MAX_BODY} chars).` }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = adminClient as unknown as Db;

  const { data, error } = await db
    .from("user_notes")
    .insert({
      user_id: userId,
      body: text,
      created_by: actor.email ?? actor.userId ?? null,
    })
    .select("id,body,created_by,created_at")
    .maybeSingle();
  if (error) {
    console.error("users/notes POST: insert failed", error);
    return NextResponse.json(
      { error: "Could not save the note (is the 20260828 migration applied in prod?)." },
      { status: 500 },
    );
  }

  await logAdminAction({
    actor,
    action: "users.note.add",
    targetType: "user",
    targetId: userId,
    details: { noteId: (data?.id as string | undefined) ?? null },
  });

  return NextResponse.json({ ok: true, note: data });
}
