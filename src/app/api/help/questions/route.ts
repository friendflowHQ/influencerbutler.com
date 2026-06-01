/**
 * /api/help/questions - community Q&A storage.
 *
 * GET: public list of approved questions (read-only mirror of what
 *   /help/community shows). Supports ?workspace=<id>, ?sort=top|new,
 *   ?limit=N (<=100), ?cursor=<created_at_ms>. Returns author profile
 *   metadata pulled from `profiles` so desktop-app clients don't have to
 *   make a second round-trip.
 *
 * POST: inserts an approved question. Auth is dual-mode:
 *   - Authorization: Bearer <license-key>  (Influencer Butler desktop)
 *   - Supabase session cookie                (website browser)
 *   See src/lib/license-auth.ts for the resolution helper.
 *
 * Inserts use the service-role client so the row is created with the
 * caller's resolved author_id (license-bearer callers have no session,
 * so they can't satisfy the RLS auth.uid() = author_id check).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";
import { resolveAuth } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE_MAX = 200;
const BODY_MAX = 8000;
const WORKSPACE_MAX = 80;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ALLOWED_SORTS = new Set(["top", "new"]);
const WORKSPACE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

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

type ListRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  upvotes: number | null;
  answer_count: number | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type ListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => ListBuilder;
      lt: (col: string, value: string) => ListBuilder;
      order: (col: string, opts: { ascending: boolean }) => ListBuilder;
      limit: (n: number) => ListBuilder;
      in: (col: string, values: string[]) => Promise<{
        data: ProfileRow[] | null;
        error: unknown;
      }>;
    } & Promise<{ data: ListRow[] | null; error: unknown }>;
  };
};

interface ListBuilder {
  eq(col: string, value: string): ListBuilder;
  lt(col: string, value: string): ListBuilder;
  order(col: string, opts: { ascending: boolean }): ListBuilder;
  limit(n: number): ListBuilder;
  then: Promise<{ data: ListRow[] | null; error: { message?: string } | null }>["then"];
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type PostBody = {
  workspaceId?: string;
  title?: string;
  body?: string;
};

// ── GET /api/help/questions ────────────────────────────────────────────────
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceParam = (url.searchParams.get("workspace") || "").toLowerCase();
  const sortParam = (url.searchParams.get("sort") || "top").toLowerCase();
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const cursorParam = url.searchParams.get("cursor") || "";

  if (workspaceParam && !WORKSPACE_ID_RE.test(workspaceParam)) {
    return NextResponse.json({ ok: false, error: "Invalid workspace id" }, { status: 400 });
  }
  if (!ALLOWED_SORTS.has(sortParam)) {
    return NextResponse.json({ ok: false, error: "Invalid sort" }, { status: 400 });
  }

  // Use the anonymous client so RLS applies (public read policy only sees
  // approved rows). This way the desktop-app GET behaves identically to
  // the public site read - no leakage.
  const supabase = (await createClient()) as unknown as ListClient;

  try {
    let builder = supabase.from("community_questions").select(
      "id, workspace_id, title, body, upvotes, answer_count, author_id, author_email, created_at",
    ) as unknown as ListBuilder;
    if (workspaceParam) {
      builder = builder.eq("workspace_id", workspaceParam);
    }
    if (cursorParam) {
      // cursor is created_at ISO string
      builder = builder.lt("created_at", cursorParam);
    }
    // Sort top: upvotes DESC, then created_at DESC. Sort new: created_at DESC.
    builder =
      sortParam === "new"
        ? builder.order("created_at", { ascending: false })
        : builder.order("upvotes", { ascending: false }).order("created_at", { ascending: false });
    builder = builder.limit(limit + 1);

    const { data, error } = (await (builder as unknown as Promise<{
      data: ListRow[] | null;
      error: { message?: string } | null;
    }>)) || { data: null, error: null };
    if (error) {
      console.error("[help/questions] list failed", error);
      return NextResponse.json({ ok: false, error: "List failed" }, { status: 500 });
    }
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].created_at : null;

    // Author profile enrichment via service role (profiles RLS hides
    // them from anon reads). Best-effort - if SUPABASE_SERVICE_ROLE_KEY
    // is missing we return rows with author=null.
    const authorIds = Array.from(
      new Set(trimmed.map((r) => r.author_id).filter((v): v is string => !!v)),
    );
    const authorMap = new Map<string, ProfileRow>();
    if (authorIds.length > 0) {
      const admin = createAdminClient() as unknown as ListClient | null;
      if (admin) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", authorIds);
        for (const p of profiles || []) authorMap.set(p.id, p);
      }
    }

    const questions = trimmed.map((r) => {
      const author = r.author_id ? authorMap.get(r.author_id) ?? null : null;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        title: r.title,
        body: r.body || "",
        upvotes: Number(r.upvotes || 0),
        answerCount: Number(r.answer_count || 0),
        author: author
          ? {
              display_name: author.display_name,
              username: author.username,
              avatar_url: author.avatar_url,
            }
          : null,
        createdAt: r.created_at,
      };
    });

    return NextResponse.json({ ok: true, questions, nextCursor });
  } catch (err) {
    console.error("[help/questions] GET failed", err);
    return NextResponse.json({ ok: false, error: "List failed" }, { status: 500 });
  }
}

// ── POST /api/help/questions ───────────────────────────────────────────────
export async function POST(request: Request) {
  let payload: PostBody;
  try {
    payload = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const workspaceId = (payload.workspaceId ?? "").trim().toLowerCase();
  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim();

  if (!workspaceId || workspaceId.length > WORKSPACE_MAX || !WORKSPACE_ID_RE.test(workspaceId)) {
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

  const authResult = await resolveAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }
  const { auth } = authResult;

  // Service-role insert: license-bearer callers cannot satisfy the RLS
  // auth.uid() = author_id check (no session). Cookie-session callers
  // could, but unifying the insert path keeps both auth modes equivalent.
  const admin = createAdminClient() as unknown as AdminInsertClient | null;
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const { data: inserted, error } = await admin
    .from("community_questions")
    .insert({
      workspace_id: workspaceId,
      title,
      body: body || null,
      status: "approved",
      approved_at: new Date().toISOString(),
      author_id: auth.userId,
      author_email: auth.email,
    })
    .select("id")
    .single();

  if (error) {
    console.error("community_questions insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not post question." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
