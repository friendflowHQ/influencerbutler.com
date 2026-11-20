/**
 * GET  /api/admin/support/drafts            (support.view)  all pending bot drafts
 * GET  /api/admin/support/drafts?ticket=fb-.. (support.view) the pending draft for one ticket
 * POST /api/admin/support/drafts  { draftId, outcome, reason? } (support.respond)
 *      outcome: "sent" | "edited_sent" | "rejected"
 *
 * Bot drafts are what the auto-reply sweep WOULD have sent (shadow mode, or the
 * per-run cap was hit). Reviewing them is the safe path to turning the sweep
 * live: the approve / edit / reject counts show how often the bot is right.
 * Sending itself goes through /api/admin/support/reply; this route only records
 * the outcome.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { isSupportTicketId } from "@/lib/support-worker";
import { getPendingDraftForTicket, listPendingDrafts, resolveDraft } from "@/lib/support-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(["sent", "edited_sent", "rejected"]);

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ticket = (new URL(request.url).searchParams.get("ticket") || "").trim();
  if (ticket) {
    if (!isSupportTicketId(ticket)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
    return NextResponse.json({ draft: await getPendingDraftForTicket(ticket) });
  }

  const { drafts, pending } = await listPendingDrafts(100);
  return NextResponse.json({ drafts, migrationPending: pending });
}

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { draftId?: string; outcome?: string; reason?: string };
  try {
    body = (await request.json()) as { draftId?: string; outcome?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const draftId = (body.draftId || "").trim();
  if (!UUID_RE.test(draftId)) return NextResponse.json({ error: "Bad draft id" }, { status: 400 });
  const outcome = body.outcome || "";
  if (!OUTCOMES.has(outcome)) return NextResponse.json({ error: "Bad outcome" }, { status: 400 });

  const result = await resolveDraft(
    draftId,
    outcome as "sent" | "edited_sent" | "rejected",
    actor.email || "unknown",
    body.reason,
  );
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not update draft" }, { status: 400 });

  await logAdminAction({
    actor,
    action: "support.draft",
    targetType: "support_bot_draft",
    targetId: draftId,
    details: { outcome, reason: body.reason ? body.reason.slice(0, 200) : null },
  });
  return NextResponse.json({ ok: true });
}
