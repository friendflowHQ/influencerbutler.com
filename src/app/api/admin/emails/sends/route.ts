/**
 * GET /api/admin/emails/sends?query=&category=&status=&page=
 *
 * Paged feed of individual email sends from email_sends, newest first, for the
 * admin Emails dashboard. `query` searches the recipient address (substring),
 * `category`/`status` filter exactly, `page` is 0-based with a fixed page size.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const category = (url.searchParams.get("category") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const pageRaw = Number(url.searchParams.get("page") ?? "0");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;

  let q = db
    .from("email_sends")
    .select(
      "id, resend_id, broadcast_id, recipient, subject, category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (query) {
    // Escape LIKE wildcards so a literal % or _ in the search doesn't widen it.
    const escaped = query.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.ilike("recipient", `%${escaped}%`);
  }
  if (category) q = q.eq("category", category);
  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) {
    // A missing table (migration not applied yet) is the most likely cause.
    console.error("admin emails/sends: query failed", error);
    return NextResponse.json({
      rows: [],
      total: 0,
      page,
      pageSize: PAGE_SIZE,
      migrationPending: true,
    });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    migrationPending: false,
  });
}
