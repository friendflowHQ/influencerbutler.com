/**
 * /api/help/questions — community Q&A storage. POST inserts a pending
 * question into the community_questions Supabase table; moderation
 * happens via /dashboard/admin/community. Auth is enforced via the
 * Supabase session cookie (no Authorization header needed).
 *
 * The listing page reads from Supabase directly, so there is no GET
 * handler here.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE_MAX = 200;
const BODY_MAX = 8000;
const WORKSPACE_MAX = 80;

type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
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

type PostBody = {
  workspaceId?: string;
  title?: string;
  body?: string;
};

export async function POST(request: Request) {
  let payload: PostBody;
  try {
    payload = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const workspaceId = (payload.workspaceId ?? "").trim();
  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim();

  if (!workspaceId || workspaceId.length > WORKSPACE_MAX) {
    return NextResponse.json({ ok: false, error: "Pick a workspace." }, { status: 400 });
  }
  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json(
      { ok: false, error: `Title is required (max ${TITLE_MAX} chars).` },
      { status: 400 },
    );
  }
  if (body.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Details too long (max ${BODY_MAX} chars).` },
      { status: 400 },
    );
  }

  const supabase = (await createClient()) as unknown as AuthClient;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in required to post." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("community_questions")
    .insert({
      workspace_id: workspaceId,
      title,
      body: body || null,
      status: "pending",
      author_id: userData.user.id,
      author_email: userData.user.email ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("community_questions insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not post question." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
