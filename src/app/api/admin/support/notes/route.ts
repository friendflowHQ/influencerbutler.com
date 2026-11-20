/**
 * GET  /api/admin/support/notes?id=fb-...   (support.view)
 * POST /api/admin/support/notes  { id, body } (support.respond)
 *
 * Internal notes on a ticket. Stored in Supabase (support_ticket_notes), never
 * emailed, never shown to the customer, never read or overwritten by the bots.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { isSupportTicketId } from "@/lib/support-worker";
import { addNote, getTicketMeta, listNotes } from "@/lib/support-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!isSupportTicketId(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const [{ notes, pending }, { meta }] = await Promise.all([listNotes(id), getTicketMeta([id])]);
  return NextResponse.json({ notes, assignee: meta[id]?.assignee ?? "", migrationPending: pending });
}

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; body?: string };
  try {
    body = (await request.json()) as { id?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!isSupportTicketId(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const result = await addNote(id, actor.email || "unknown", body.body || "");
  if (!result.ok) {
    if (result.pending) {
      return NextResponse.json(
        { error: "Notes are not set up yet. Run supabase/migrations/20261121_support_notes_assignee_drafts.sql.", migrationPending: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.error || "Could not save note" }, { status: 400 });
  }

  await logAdminAction({
    actor,
    action: "support.note",
    targetType: "support_ticket",
    targetId: id,
    details: { length: (body.body || "").trim().length },
  });
  return NextResponse.json({ ok: true });
}
