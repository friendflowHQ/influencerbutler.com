/**
 * POST /api/admin/scheduling/rearm
 * Body: { id }
 * Sends a recording bot into a call now (or re-arms one that failed/was skipped).
 * The bot is normally scheduled once at booking time; if that failed, or the call
 * was added with a hand-pasted link that predates the recordable-link fix, this
 * lets the owner send the "Influencer Butler Notetaker" into the room on demand,
 * including mid-call. Best-effort stops any stale bot first, then schedules a new
 * one to join immediately (or at the call's start time if it has not begun).
 * Gated by scheduling.manage; audit-logged. Mirrors src/app/api/admin/events/rearm.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/scheduling-server";
import { scheduleBot, stopBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Body = { id?: string };

type BookingRow = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  join_url: string | null;
  meeting_provider: string | null;
  recall_bot_id: string | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try { body = (await request.json()) as Body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: booking, error } = await admin
    .from("call_bookings")
    .select("id, status, starts_at, ends_at, join_url, meeting_provider, recall_bot_id")
    .eq("id", id)
    .maybeSingle();
  if (error) { console.error("[scheduling/rearm] load", error.message); return NextResponse.json({ error: "Lookup failed" }, { status: 500 }); }
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = booking as BookingRow;

  // Eligibility: a bot can only join a live Google Meet room for a call that is
  // still confirmed and has not ended.
  if (b.status === "cancelled") {
    return NextResponse.json({ error: "This call is cancelled." }, { status: 400 });
  }
  if (!shouldScheduleRecordingBot(b.meeting_provider, b.join_url)) {
    return NextResponse.json(
      { error: "This call has no joinable Google Meet link. Use Set link to add a meet.google.com link first." },
      { status: 400 },
    );
  }
  const endsMs = b.ends_at ? Date.parse(b.ends_at) : NaN;
  if (Number.isFinite(endsMs) && endsMs <= Date.now()) {
    return NextResponse.json({ error: "This call has already ended." }, { status: 400 });
  }
  if (!isRecallConfigured()) {
    return NextResponse.json(
      { error: "Recall.ai is not configured (RECALL_API_KEY missing), so recording cannot be scheduled." },
      { status: 400 },
    );
  }

  // Best-effort: remove any stale bot so a retry never leaves two bots queued.
  if (b.recall_bot_id) {
    try { await stopBot(b.recall_bot_id); } catch (e) { console.error("[scheduling/rearm] stop stale bot", e); }
  }

  // Join immediately if the call is under way; otherwise at its start time.
  const startMs = Date.parse(b.starts_at);
  const joinAtISO = new Date(Math.max(Date.now(), Number.isFinite(startMs) ? startMs : Date.now())).toISOString();

  const bot = await scheduleBot({
    meetingUrl: b.join_url as string,
    joinAtISO,
    botName: "Influencer Butler Notetaker",
    metadata: { bookingId: id },
  });

  const recordingStatus = bot ? "scheduled" : "failed";
  const { error: upErr } = await admin
    .from("call_bookings")
    .update({ recall_bot_id: bot?.id ?? null, recording_status: recordingStatus })
    .eq("id", id);
  if (upErr) { console.error("[scheduling/rearm] update", upErr.message); return NextResponse.json({ error: "Could not update the call." }, { status: 500 }); }

  await logAdminAction({
    actor, action: "scheduling.rearm_recording", targetType: "call_booking", targetId: id,
    details: { recordingStatus, joinAtISO },
  });

  if (!bot) {
    return NextResponse.json(
      { error: "Recall rejected the bot. Check RECALL_API_KEY and RECALL_API_BASE (region), then look for a [recall] scheduleBot log line." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, recordingStatus, joinAtISO });
}
