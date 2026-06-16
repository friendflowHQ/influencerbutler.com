/**
 * GET /api/admin/community/list?type=question|answer&status=all|approved|pending|rejected
 *
 * Polymorphic admin list endpoint. Returns rows of the requested type
 * filtered by status (default 'all'), enriched with author profile data
 * (display_name, username, avatar_url) and — for answers — the parent
 * question title so the admin can see context. Always includes a stats
 * object with row counts per status for the requested type.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { resolveCommunityAuthors, type CommunityAuthor } from "@/lib/community-authors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusFilter = "all" | "approved" | "pending" | "rejected";
type RowType = "question" | "answer";

type QuestionRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  status: string;
  upvotes: number | null;
  answer_count: number | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  body: string;
  status: string;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
};

type AdminListClient = {
  from: (table: string) => {
    select: (cols: string, options?: { count?: "exact"; head?: boolean }) => {
      eq?: (col: string, value: string) => unknown;
      in?: (col: string, values: string[]) => unknown;
      order?: (col: string, opts: { ascending: boolean }) => unknown;
    } & Promise<unknown>;
  };
};

type Filterable<T> = {
  eq: (col: string, value: string) => Filterable<T>;
  in: (col: string, values: string[]) => Filterable<T>;
  order: (col: string, opts: { ascending: boolean }) => Filterable<T>;
  then: Promise<{ data: T[] | null; error: { message?: string } | null }>["then"];
};

function parseStatus(raw: string | null): StatusFilter {
  if (raw === "approved" || raw === "pending" || raw === "rejected") return raw;
  return "all";
}

function parseType(raw: string | null): RowType {
  return raw === "answer" ? "answer" : "question";
}

async function countByStatus(
  supabase: AdminListClient,
  table: string,
): Promise<{ total: number; approved: number; pending: number; rejected: number }> {
  const counts = { total: 0, approved: 0, pending: 0, rejected: 0 };
  await Promise.all(
    (["approved", "pending", "rejected"] as const).map(async (s) => {
      const builder = supabase.from(table).select("id", { count: "exact", head: true }) as unknown as {
        eq: (c: string, v: string) => Promise<{ count: number | null; error: unknown }>;
      };
      const { count } = await builder.eq("status", s);
      counts[s] = count ?? 0;
    }),
  );
  counts.total = counts.approved + counts.pending + counts.rejected;
  return counts;
}

export async function GET(request: Request) {
  const actor = await requirePermission("community.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as AdminListClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const type = parseType(url.searchParams.get("type"));
  const status = parseStatus(url.searchParams.get("status"));
  const table = type === "question" ? "community_questions" : "community_answers";
  const selectCols =
    type === "question"
      ? "id, workspace_id, title, body, status, upvotes, answer_count, author_id, author_email, created_at"
      : "id, question_id, body, status, author_id, author_email, created_at";

  try {
    let builder = supabase.from(table).select(selectCols) as unknown as Filterable<
      QuestionRow | AnswerRow
    >;
    if (status !== "all") {
      builder = builder.eq("status", status);
    }
    const { data, error } = await (builder.order("created_at", {
      ascending: false,
    }) as unknown as Promise<{
      data: (QuestionRow | AnswerRow)[] | null;
      error: { message?: string } | null;
    }>);
    if (error) {
      console.error("admin community list query failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const rows = data ?? [];

    // Look up author profiles in one batch.
    const authorMap = await resolveCommunityAuthors(rows.map((r) => r.author_id));
    const authors: Record<string, CommunityAuthor> = {};
    for (const [id, author] of authorMap) authors[id] = author;

    // For answers, look up parent question titles so the admin sees context.
    const questionTitles: Record<string, { title: string; workspace_id: string }> = {};
    if (type === "answer" && rows.length > 0) {
      const ids = Array.from(
        new Set(
          (rows as AnswerRow[])
            .map((a) => a.question_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      );
      if (ids.length > 0) {
        const qBuilder = supabase
          .from("community_questions")
          .select("id, title, workspace_id") as unknown as {
          in: (col: string, values: string[]) => Promise<{
            data: { id: string; title: string; workspace_id: string }[] | null;
            error: unknown;
          }>;
        };
        const { data: parents } = await qBuilder.in("id", ids);
        if (parents) {
          for (const q of parents) {
            questionTitles[q.id] = { title: q.title, workspace_id: q.workspace_id };
          }
        }
      }
    }

    const stats = await countByStatus(supabase, table);

    return NextResponse.json({
      admin: { email: actor.email },
      type,
      status,
      rows,
      authors,
      questionTitles,
      stats,
    });
  } catch (error) {
    console.error("admin community list failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
