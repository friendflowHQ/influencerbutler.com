/**
 * POST /api/admin/support/assign  { id, assignee }   (support.respond)
 *
 * assignee: "me" (the caller), "" (unassign), or another admin's email. Stored in
 * Supabase (support_ticket_assignments) so the Worker's ticket schema stays put.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { isSupportTicketId } from "@/lib/support-worker";
import { setAssignee } from "@/lib/support-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; assignee?: string };
  try {
    body = (await request.json()) as { id?: string; assignee?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!isSupportTicketId(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const raw = (body.assignee ?? "").trim();
  const assignee = raw === "me" ? (actor.email || "").toLowerCase() : raw.toLowerCase();
  if (assignee && !EMAIL_RE.test(assignee)) {
    return NextResponse.json({ error: "Assignee must be an email address" }, { status: 400 });
  }

  const result = await setAssignee(id, assignee, actor.email || "unknown");
  if (!result.ok) {
    if (result.pending) {
      return NextResponse.json(
        { error: "Assignment is not set up yet. Run supabase/migrations/20261121_support_notes_assignee_drafts.sql.", migrationPending: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.error || "Could not assign" }, { status: 400 });
  }

  await logAdminAction({
    actor,
    action: "support.assign",
    targetType: "support_ticket",
    targetId: id,
    details: { assignee: assignee || null },
  });
  return NextResponse.json({ ok: true, assignee });
}
