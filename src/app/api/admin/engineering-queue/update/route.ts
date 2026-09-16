/**
 * POST /api/admin/engineering-queue/update
 * Body: { sourceTicketIds: string[], status: "working" | "done", prUrl?: string }
 *
 * The engineering-autopilot routine calls this to mark a queue item it is
 * working on (or has finished, with the PR url) so the item does not get picked
 * up again. It tags every source ticket eng-working / eng-done on the feedback
 * Worker and advances the ticket status (patching / committed) best-effort.
 *
 * Auth is the CRON_SECRET bearer (headless routine, no session), fails closed
 * when unset, matching /api/admin/community/respond. Idempotent: re-tagging an
 * already-tagged ticket is a no-op.
 */
import { NextResponse } from "next/server";
import { callSupportWorker } from "@/lib/support-worker";
import { tagTicket, type WorkerTicket } from "@/lib/support-sweep";
import { TAG_WORKING, TAG_DONE, isEngQueueConfigured } from "@/lib/engineering-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_ID_RE = /^fb-[0-9a-f-]{36}$/i;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error("[engineering-queue/update] CRON_SECRET not set"); return false; }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type UpdateBody = { sourceTicketIds?: unknown; status?: unknown; prUrl?: unknown };

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEngQueueConfigured()) {
    return NextResponse.json({ error: "SUPPORT_BOT_TOKEN not configured" }, { status: 500 });
  }

  let body: UpdateBody = {};
  try { body = (await request.json()) as UpdateBody; } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.sourceTicketIds)
    ? body.sourceTicketIds.filter((x): x is string => typeof x === "string" && TICKET_ID_RE.test(x))
    : [];
  const status = body.status === "done" ? "done" : body.status === "working" ? "working" : null;
  if (ids.length === 0 || !status) {
    return NextResponse.json(
      { error: "Body must be { sourceTicketIds: fb-<uuid>[], status: 'working'|'done', prUrl? }" },
      { status: 400 },
    );
  }

  const tag = status === "done" ? TAG_DONE : TAG_WORKING;
  const advanceStatus = status === "done" ? "committed" : "patching";
  const tagged: string[] = [];
  const failed: string[] = [];

  for (const id of ids) {
    // Fetch first so tagTicket preserves the ticket's existing tags (it merges
    // onto t.tags; without the current tags it would overwrite them).
    const getRes = await callSupportWorker<{ ticket?: WorkerTicket } & WorkerTicket>(
      `/agent/tickets/${encodeURIComponent(id)}`,
    );
    if (!getRes.ok) { failed.push(id); continue; }
    const t = (getRes.data.ticket ?? (getRes.data as WorkerTicket)) as WorkerTicket;
    if (!t?.id) { failed.push(id); continue; }
    try {
      await tagTicket(t, tag);
      // Best-effort status advance; ignore failure (tag is the source of truth).
      await callSupportWorker(`/agent/tickets/${encodeURIComponent(id)}/triage`, {
        method: "POST",
        body: { status: advanceStatus },
      });
      tagged.push(id);
    } catch (e) {
      console.error("[engineering-queue/update] tag failed", id, e);
      failed.push(id);
    }
  }

  const prUrl = typeof body.prUrl === "string" ? body.prUrl.slice(0, 500) : null;
  if (prUrl) console.log(`[engineering-queue/update] ${status} ${tagged.join(",")} pr=${prUrl}`);

  return NextResponse.json({ ok: failed.length === 0, status, tagged, failed, prUrl });
}
