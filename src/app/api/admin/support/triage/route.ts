/**
 * POST /api/admin/support/triage
 * Body: { id, status?, classification?, priority?, tags?, escalatedReason?, agentNotes? }
 *
 * Human triage from the dashboard: change a ticket's status/priority/tags,
 * take over (status='escalated'), mark spam, or resolve (status='fixed').
 * Proxies the feedback Worker's /agent/tickets/:id/triage behind the
 * support.respond permission and audits the action.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { callSupportWorker } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIORITY_RE = /^P[0-3]$/;
const ALLOWED_STATUSES = new Set([
  "sent", "acked", "clarifying", "waiting_on_user", "user_replied",
  "patching", "committed", "released", "fixed", "escalated", "spam", "synced", "archived",
]);
const ALLOWED_CLASSIFICATIONS = new Set(["bug", "feature", "question", "spam"]);

type TriageBody = {
  id?: string;
  status?: string;
  classification?: string;
  priority?: string;
  tags?: string;
  escalatedReason?: string;
  agentNotes?: string;
};

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: TriageBody;
  try {
    body = (await request.json()) as TriageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!FB_ID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.has(body.status)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
    patch.status = body.status;
  }
  if (typeof body.classification === "string") {
    if (!ALLOWED_CLASSIFICATIONS.has(body.classification)) return NextResponse.json({ error: "Bad classification" }, { status: 400 });
    patch.classification = body.classification;
  }
  if (typeof body.priority === "string") {
    if (!PRIORITY_RE.test(body.priority)) return NextResponse.json({ error: "Bad priority" }, { status: 400 });
    patch.priority = body.priority;
  }
  if (typeof body.tags === "string") patch.tags = body.tags.slice(0, 300);
  if (typeof body.escalatedReason === "string") patch.escalatedReason = body.escalatedReason.slice(0, 1000);
  if (typeof body.agentNotes === "string") patch.agentNotes = body.agentNotes.slice(0, 16000);

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No updates" }, { status: 400 });

  const result = await callSupportWorker<{ escalationEmailed?: boolean }>(
    `/agent/tickets/${encodeURIComponent(id)}/triage`,
    { method: "POST", body: patch },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAdminAction({
    actor,
    action: "support.triage",
    targetType: "support_ticket",
    targetId: id,
    details: patch,
  });

  return NextResponse.json({ ok: true, escalationEmailed: !!result.data.escalationEmailed });
}
