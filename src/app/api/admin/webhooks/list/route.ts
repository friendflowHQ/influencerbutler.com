/**
 * GET /api/admin/webhooks/list?status=all|processed|error|skipped&event=<name>&page=N
 * GET /api/admin/webhooks/list?id=<uuid>   (detail mode: one row incl. payload)
 *
 * Read-only view over the webhook_events delivery log. The list omits the
 * payload column (heavy JSONB); the detail mode returns it for the expand
 * view. When the table is missing in prod (manual migrations), returns
 * { rows: [], tableMissing: true } so the page can say "migration not applied
 * yet" instead of erroring.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type EventRow = {
  id: string;
  source: string;
  event_name: string | null;
  record_id: string | null;
  user_hint: string | null;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  payload?: unknown;
};

type ListBuilder = {
  eq: (col: string, value: string) => ListBuilder;
  gte: (col: string, value: string) => ListBuilder;
  order: (col: string, opts: { ascending: boolean }) => ListBuilder;
  range: (from: number, to: number) => Promise<{
    data: EventRow[] | null;
    count: number | null;
    error: { message?: string; code?: string } | null;
  }>;
  maybeSingle: () => Promise<{
    data: EventRow | null;
    error: { message?: string; code?: string } | null;
  }>;
};

type EventsClient = {
  from: (table: string) => {
    select: (cols: string, options?: { count?: "exact"; head?: boolean }) => ListBuilder;
  };
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "");
}

export async function GET(request: Request) {
  const actor = await requirePermission("webhooks.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as EventsClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("id,source,event_name,record_id,user_hint,status,error_message,duration_ms,payload,created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return NextResponse.json({ row: null, tableMissing: true });
        console.error("admin webhooks detail failed", error);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
      }
      return NextResponse.json({ row: data ?? null });
    }

    const statusRaw = url.searchParams.get("status") ?? "all";
    const status = ["processed", "error", "skipped"].includes(statusRaw) ? statusRaw : "all";
    const event = (url.searchParams.get("event") ?? "").trim();
    const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 10000) : 1;
    const offset = (page - 1) * PAGE_SIZE;

    let builder = supabase
      .from("webhook_events")
      .select("id,source,event_name,record_id,user_hint,status,error_message,duration_ms,created_at", {
        count: "exact",
      });
    if (status !== "all") builder = builder.eq("status", status);
    if (event) builder = builder.eq("event_name", event);

    const { data, count, error } = await builder
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ rows: [], total: 0, errorCount7d: 0, tableMissing: true });
      }
      console.error("admin webhooks list failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Red-badge count: errors in the last 7 days (independent of filters).
    let errorCount7d = 0;
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const head = supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "error")
        .gte("created_at", weekAgo) as unknown as PromiseLike<{ count: number | null }>;
      const { count: errCount } = await head;
      errorCount7d = errCount ?? 0;
    } catch {
      // badge is cosmetic
    }

    return NextResponse.json({
      admin: { email: actor.email },
      rows: data ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      errorCount7d,
    });
  } catch (error) {
    console.error("admin webhooks list threw", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
