/**
 * POST /api/admin/support/suggest
 * Body: { id }
 *
 * Drafts a grounded reply for one ticket using the same engine as the auto-
 * responder sweep (support-sweep.draftReplyForTicket), so the admin can review,
 * edit, and send it from the drawer. This route NEVER sends: it only returns a
 * suggestion. Gated by the support.respond permission and audited.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { callSupportWorker } from "@/lib/support-worker";
import { draftReplyForTicket, type WorkerTicket } from "@/lib/support-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!FB_ID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const ticketRes = await callSupportWorker<{ ticket?: WorkerTicket } & WorkerTicket>(
    `/agent/tickets/${encodeURIComponent(id)}`,
  );
  if (!ticketRes.ok) {
    return NextResponse.json({ error: ticketRes.error }, { status: ticketRes.status });
  }
  const ticket = (ticketRes.data.ticket ?? (ticketRes.data as WorkerTicket)) || null;
  if (!ticket || !ticket.id) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const draft = await draftReplyForTicket(ticket);
  if (!draft) {
    return NextResponse.json(
      { error: "Drafting is unavailable (no AI provider configured)." },
      { status: 503 },
    );
  }

  await logAdminAction({
    actor,
    action: "support.suggest",
    targetType: "support_ticket",
    targetId: id,
    details: { action: draft.action, confidence: draft.confidence, grounded: draft.grounded },
  });

  return NextResponse.json({
    ok: true,
    subject: draft.subject,
    body: draft.body,
    reason: draft.reason,
    confidence: draft.confidence,
    action: draft.action,
    grounded: draft.grounded,
  });
}
