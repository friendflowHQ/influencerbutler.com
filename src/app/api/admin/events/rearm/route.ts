/**
 * POST /api/admin/events/rearm
 * Body: { id }
 * Retries scheduling the Recall.ai recording bot for an existing event whose
 * recording never armed (recording_status 'failed'). The bot is normally
 * scheduled once at create time; if that Recall call failed, the status sticks
 * at 'failed' and nothing re-arms it before the call, so this endpoint lets an
 * admin retry without deleting and recreating the event. Best-effort stops any
 * stale bot first, then reschedules. Gated by events.manage; audit-logged.
 * Mirrors the Recall wiring in src/app/api/admin/events/create/route.ts.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { scheduleBot, stopBot, isRecallConfigured } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Body = { id?: string };

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Eligibility: a bot can only join a live Google Meet room for a scheduled
  // event that has recording turned on and has not ended yet.
  if (event.status !== "scheduled") {
    return NextResponse.json({ error: "Only scheduled events can be re-armed." }, { status: 400 });
  }
  if (!event.recordEnabled) {
    return NextResponse.json({ error: "Recording is turned off for this event." }, { status: 400 });
  }
  if (event.meetingProvider !== "google_meet" || !event.joinUrl) {
    return NextResponse.json(
      { error: "Recording needs an auto-created Google Meet link (a manual link has no room a bot can join)." },
      { status: 400 },
    );
  }
  if (Date.parse(event.endsAt) <= Date.now()) {
    return NextResponse.json({ error: "This event has already ended." }, { status: 400 });
  }
  if (!isRecallConfigured()) {
    return NextResponse.json(
      { error: "Recall.ai is not configured (RECALL_API_KEY missing), so recording cannot be scheduled." },
      { status: 400 },
    );
  }

  // Best-effort: remove any stale bot so a retry never leaves two bots queued.
  if (event.recallBotId) {
    try {
      await stopBot(event.recallBotId);
    } catch (e) {
      console.error("[admin/events/rearm] stop stale bot", e);
    }
  }

  const bot = await scheduleBot({
    meetingUrl: event.joinUrl,
    joinAtISO: new Date(event.startsAt).toISOString(),
    botName: "Influencer Butler Notetaker",
    metadata: { eventId: id },
  });

  const recordingStatus = bot ? "scheduled" : "failed";
  const { error } = await admin
    .from("events")
    .update({ recall_bot_id: bot?.id ?? null, recording_status: recordingStatus })
    .eq("id", id);
  if (error) {
    console.error("[admin/events/rearm] update", error.message);
    return NextResponse.json({ error: "Could not update the event." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "event.rearm_recording",
    targetType: "event",
    targetId: id,
    details: { recordingStatus },
  });

  if (!bot) {
    return NextResponse.json(
      {
        error:
          "Recall rejected the bot again. Check RECALL_API_KEY and RECALL_API_BASE (region), then look for a [recall] scheduleBot log line.",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, recordingStatus });
}
