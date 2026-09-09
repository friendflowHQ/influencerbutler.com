/**
 * POST /api/admin/extension-feedback/backfill-d1
 *
 * One-time, idempotent, batched backfill of the pre-existing Chrome-extension
 * feedback backlog into the feedback Worker's D1 support inbox. Extension
 * feedback used to live only in Supabase (extension_feedback) with a one-way
 * resolution note and no conversation. New feedback is now mirrored into D1 on
 * submit; this fills the rows that predate that mirror, so the whole backlog is
 * answerable in one place (dashboard/admin/support) and the reply reaches the
 * user in-app (GET /api/extension/feedback/replies).
 *
 * Only actionable types (bug/feature/question) are filed; praise/other stay
 * Supabase-only. Each filed row is stamped with its d1_ticket_id, so a re-run
 * never double-files. Processes one batch per call; run again until `remaining`
 * is 0. Gated on support.respond.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { submitSupportTicket } from "@/lib/support-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError, isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 50;
const ACTIONABLE = ["bug", "feature", "question"];
const DESC_MAX = 7000;

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_feedback")
    .select("id, email, feedback_type, title, message, page_url, ext_version, created_at")
    .is("d1_ticket_id", null)
    .in("feedback_type", ACTIONABLE)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    // Missing d1_ticket_id column (or the whole table): tell the operator to run
    // the migration rather than erroring.
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return NextResponse.json(
        { error: "Apply the extension_feedback d1_ticket_id migration first.", migrationPending: true },
        { status: 409 },
      );
    }
    console.error("admin/extension-feedback/backfill-d1: query failed", error);
    return NextResponse.json({ error: "Could not load the backlog" }, { status: 500 });
  }

  const rows = data ?? [];
  let filed = 0;
  let failed = 0;

  for (const row of rows) {
    const type = row.feedback_type as "bug" | "feature" | "question";
    const message = String(row.message ?? "");
    const title =
      (typeof row.title === "string" && row.title.trim()) || message.slice(0, 120) || "(extension feedback)";
    const provenance = [
      "---",
      "[Backfilled from Chrome extension feedback]",
      row.created_at ? `Originally sent: ${String(row.created_at)}` : "",
      row.ext_version ? `Extension version: ${String(row.ext_version)}` : "",
      row.page_url ? `Page: ${String(row.page_url)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const description = `${message}\n\n${provenance}`.slice(0, DESC_MAX);

    let d1Id: string | null = null;
    try {
      const res = await submitSupportTicket({
        type,
        title,
        description,
        userEmail: (row.email as string | null) || undefined,
        platform: "extension",
        appVersion: (row.ext_version as string | null) || undefined,
        tags: "extension,backfill",
      });
      if (res.ok && res.id) d1Id = res.id;
    } catch (err) {
      console.error("backfill-d1: file failed", err);
    }
    if (!d1Id) {
      failed += 1;
      continue;
    }
    const { error: linkErr } = await admin
      .from("extension_feedback")
      .update({ d1_ticket_id: d1Id })
      .eq("id", row.id);
    if (linkErr) {
      // Filed into D1 but could not record the link: count as failed so it is
      // retried. A retry re-files (a rare duplicate) rather than stranding it.
      console.error("backfill-d1: link failed", linkErr);
      failed += 1;
      continue;
    }
    filed += 1;
  }

  let remaining = 0;
  try {
    const { count } = await admin
      .from("extension_feedback")
      .select("id", { count: "exact", head: true })
      .is("d1_ticket_id", null)
      .in("feedback_type", ACTIONABLE);
    remaining = count ?? 0;
  } catch {
    /* best-effort: remaining is only a progress hint */
  }

  await logAdminAction({
    actor,
    action: "support.respond",
    targetType: "extension_feedback",
    targetId: "backfill-d1",
    details: { scanned: rows.length, filed, failed, remaining },
  });

  return NextResponse.json({ ok: true, scanned: rows.length, filed, failed, remaining });
}
