/**
 * GET /api/admin/audit/list
 *
 * Read-only, paginated view over admin_audit_log (append-only accountability
 * trail written by logAdminAction). Filters: actor (email substring), action
 * (substring), target (exact target_type), from/to (ISO dates). This route
 * never mutates the table - there is intentionally no delete or prune.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: unknown;
  created_at: string;
};

type AuditBuilder = {
  ilike: (col: string, pattern: string) => AuditBuilder;
  eq: (col: string, value: string) => AuditBuilder;
  gte: (col: string, value: string) => AuditBuilder;
  lte: (col: string, value: string) => AuditBuilder;
  order: (col: string, opts: { ascending: boolean }) => AuditBuilder;
  range: (from: number, to: number) => Promise<{
    data: AuditRow[] | null;
    count: number | null;
    error: { message?: string } | null;
  }>;
};

type AuditClient = {
  from: (table: string) => {
    select: (cols: string, options?: { count?: "exact" }) => AuditBuilder;
  };
};

function parseIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const actor = await requirePermission("audit.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as AuditClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const actorFilter = (url.searchParams.get("actor") ?? "").trim();
  const actionFilter = (url.searchParams.get("action") ?? "").trim();
  const targetFilter = (url.searchParams.get("target") ?? "").trim();
  const fromIso = parseIsoDate(url.searchParams.get("from"));
  const toIso = parseIsoDate(url.searchParams.get("to"));
  const page = clampInt(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  try {
    let builder = supabase
      .from("admin_audit_log")
      .select(
        "id,actor_user_id,actor_email,actor_role,action,target_type,target_id,details,created_at",
        { count: "exact" },
      );
    if (actorFilter) builder = builder.ilike("actor_email", `%${actorFilter}%`);
    if (actionFilter) builder = builder.ilike("action", `%${actionFilter}%`);
    if (targetFilter) builder = builder.eq("target_type", targetFilter);
    if (fromIso) builder = builder.gte("created_at", fromIso);
    if (toIso) builder = builder.lte("created_at", toIso);

    const { data, count, error } = await builder
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("admin audit list query failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({
      admin: { email: actor.email },
      rows: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("admin audit list failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
