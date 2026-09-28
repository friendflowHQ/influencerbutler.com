/**
 * GET /api/admin/extension-feedback/list?status=new|reviewed|resolved|all&type=bug|feature|praise|other|all
 *
 * Lists Chrome-extension feedback submissions for triage. Gated on
 * support.view. Newest first, capped. Soft-fails to an empty list if the
 * extension_feedback migration has not been applied in prod yet.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["new", "reviewed", "resolved"] as const;
const TYPES = ["bug", "feature", "praise", "other"] as const;
const MAX_ROWS = 200;

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status") ?? "new";
  const typeRaw = url.searchParams.get("type") ?? "all";
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : "all";
  const type = (TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "all";

  const admin = createAdminClient();
  let query = admin
    .from("extension_feedback")
    .select(
      "id, email, feedback_type, message, page_url, ext_version, browser, status, resolved_version, resolution_note, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status !== "all") query = query.eq("status", status);
  if (type !== "all") query = query.eq("feedback_type", type);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ items: [], migrationPending: true });
    }
    console.error("admin/extension-feedback/list: query failed", error);
    return NextResponse.json({ error: "Could not load feedback" }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    feedbackType: (row.feedback_type as string | null) ?? "other",
    message: (row.message as string | null) ?? "",
    pageUrl: (row.page_url as string | null) ?? null,
    extVersion: (row.ext_version as string | null) ?? null,
    browser: (row.browser as string | null) ?? null,
    status: (row.status as string | null) ?? "new",
    // These three exist only after 20260825_extension_feedback_resolution.
    resolvedVersion: (row.resolved_version as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: String(row.created_at),
  }));

  return NextResponse.json({ admin: { email: actor.email }, items });
}
