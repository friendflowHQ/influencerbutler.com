/**
 * POST /api/admin/scheduling/update
 * Body: { id, action:'complete'|'no_show'|'no_show_email'|'cancel'|'notes'|'link'|'reschedule', ... }
 * Owner-side booking mutations. Gated by scheduling.manage, audited.
 *
 * reschedule: { newStartMs, force?, sendEmail? }. Refuses a past time, and (unless
 * force) a time that overlaps another call/block/your calendar. It moves the
 * Google Meet event, re-arms the recording bot, resets the reminders and (unless
 * sendEmail === false) emails the customer an updated invite.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, loadConfig, checkMove } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { sendCancellation, sendMissedYou, sendLinkAttached, sendRescheduled, type BookingEmailData } from "@/lib/call-emails";
import { createMeetEvent, deleteMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { stopBot, scheduleBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { id?: string; action?: string; hostNotes?: string; joinUrl?: string; newStartMs?: number; force?: boolean; sendEmail?: boolean };

export async function POST(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = (body.id || "").trim();
  const action = body.action || "";
  if (!id || !action) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: booking, error: readErr } = await admin
    .from("call_bookings")
    .select("id,user_email,user_name,call_type,starts_at,user_ends_at,user_timezone,topic,status,join_url,meeting_provider,meeting_id,recall_bot_id,recording_status")
    .eq("id", id).maybeSingle();
  if (readErr || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (action === "complete") patch.status = "completed";
  else if (action === "no_show" || action === "no_show_email") patch.status = "no_show";
  else if (action === "cancel") { patch.status = "cancelled"; patch.cancelled_at = new Date().toISOString(); patch.recording_status = "none"; }
  else if (action === "notes") patch.host_notes = String(body.hostNotes ?? "").slice(0, 8000);
  else if (action === "link") patch.join_url = String(body.joinUrl ?? "").slice(0, 500);
  else if (action === "reschedule") return reschedule(admin, actor, booking as BookingRow, body);
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const { error: updErr } = await admin.from("call_bookings").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  // Best-effort call emails. We track whether the send actually succeeded so the
  // admin UI can distinguish "marked + emailed" from "marked, but email failed".
  let emailSent = false;

  if (action === "no_show_email") {
    try {
      const data: BookingEmailData = {
        id: booking.id as string, callType: booking.call_type as CallTypeKey,
        userEmail: booking.user_email as string, userName: booking.user_name as string | null,
        startMs: Date.parse(booking.starts_at as string), userEndMs: Date.parse(booking.user_ends_at as string),
        userTimezone: booking.user_timezone as string | null,
      };
      emailSent = await sendMissedYou(data);
    } catch (e) { console.error("[scheduling/update] missed-you email", e); }
  }

  if (action === "cancel") {
    try {
      const data: BookingEmailData = {
        id: booking.id as string, callType: booking.call_type as CallTypeKey,
        userEmail: booking.user_email as string, userName: booking.user_name as string | null,
        startMs: Date.parse(booking.starts_at as string), userEndMs: Date.parse(booking.user_ends_at as string),
        userTimezone: booking.user_timezone as string | null,
      };
      emailSent = await sendCancellation(data);
    } catch (e) { console.error("[scheduling/update] cancel email", e); }
    if (booking.meeting_provider === "google_meet" && booking.meeting_id) {
      try { const cfg = await loadConfig(admin); if (cfg.googleRefreshToken) await deleteMeetEvent(cfg.googleRefreshToken, booking.meeting_id as string); }
      catch (e) { console.error("[scheduling/update] meet delete", e); }
    }
    // Stop / remove the recording bot so it never joins a cancelled call.
    if (booking.recall_bot_id) {
      try { await stopBot(booking.recall_bot_id as string); }
      catch (e) { console.error("[scheduling/update] stop bot", e); }
    }
  }

  // Attaching a link emails the customer the join link (with an updated .ics),
  // fulfilling the confirmation email's "will be emailed to you shortly" promise.
  // Clearing the link (empty value) is a silent DB fix, so we skip the email then.
  if (action === "link") {
    const newUrl = String(patch.join_url || "");
    if (newUrl) {
      try {
        const data: BookingEmailData = {
          id: booking.id as string, callType: booking.call_type as CallTypeKey,
          userEmail: booking.user_email as string, userName: booking.user_name as string | null,
          startMs: Date.parse(booking.starts_at as string), userEndMs: Date.parse(booking.user_ends_at as string),
          userTimezone: booking.user_timezone as string | null,
          topic: (booking.topic as string | null) ?? null,
          joinUrl: newUrl,
        };
        emailSent = await sendLinkAttached(data);
      } catch (e) { console.error("[scheduling/update] link email", e); }
    }
  }

  await logAdminAction({ actor, action: `scheduling.${action}`, targetType: "call_booking", targetId: id, details: patch });
  return NextResponse.json({ ok: true, emailSent });
}

type Admin = NonNullable<ReturnType<typeof getAdmin>>;
type BookingRow = {
  id: string; user_email: string; user_name: string | null; call_type: CallTypeKey;
  starts_at: string; user_ends_at: string; user_timezone: string | null; topic: string | null; status: string;
  join_url: string | null; meeting_provider: string | null; meeting_id: string | null;
  recall_bot_id: string | null; recording_status: string | null;
};

/**
 * Moves a booking to a new start time and carries everything tied to the old
 * time with it: the Google Meet event, the recording bot, the 24h/1h reminder
 * stamps and the customer's calendar invite.
 */
async function reschedule(admin: Admin, actor: Parameters<typeof logAdminAction>[0]["actor"], booking: BookingRow, body: Body) {
  const startMs = Number(body.newStartMs);
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Bad time" }, { status: 400 });
  if (booking.status === "cancelled" || booking.status === "completed") {
    return NextResponse.json({ error: "Only upcoming calls can be moved. Add a new call instead." }, { status: 409 });
  }
  const oldStartMs = Date.parse(booking.starts_at);
  if (startMs === oldStartMs) return NextResponse.json({ error: "Pick a different time than the current one." }, { status: 400 });
  if (startMs < Date.now()) return NextResponse.json({ error: "That time is in the past." }, { status: 400 });

  const ct = CALL_TYPES[booking.call_type];
  const endMs = startMs + ct.blockMinutes * 60_000;
  const userEndMs = startMs + ct.userMinutes * 60_000;

  if (body.force !== true) {
    const own = booking.meeting_provider === "google_meet" ? { startMs: oldStartMs, endMs: Date.parse(booking.user_ends_at) } : null;
    const chk = await checkMove(admin, booking.call_type, booking.id, startMs, Date.now(), own);
    if (!chk.ok) return NextResponse.json({ error: chk.reason }, { status: 409 });
  }

  const warnings: string[] = [];
  const cfg = await loadConfig(admin);
  let joinUrl = booking.join_url;
  let meetingId = booking.meeting_id;

  // A Meet event we created is tied to the old time: make a new one at the new
  // time, then drop the old. If creating fails we keep the old room (its link
  // still works) and say so, rather than leave the booking with no link.
  if (booking.meeting_provider === "google_meet" && meetingId && cfg.googleRefreshToken && isGoogleConfigured()) {
    const m = await createMeetEvent({
      refreshToken: cfg.googleRefreshToken,
      summary: `${ct.label} with Influencer Butler`,
      description: booking.topic || undefined,
      startMs,
      endMs: userEndMs,
      attendeeEmail: booking.user_email,
    });
    if (m) {
      try { await deleteMeetEvent(cfg.googleRefreshToken, meetingId); } catch (e) { console.error("[scheduling/update] old meet delete", e); }
      joinUrl = m.joinUrl; meetingId = m.meetingId;
    } else warnings.push("Could not move the Google Calendar event, so the original Meet link was kept. Check your calendar.");
  }

  // The bot was scheduled for the old time/room: stop it and send a new one.
  let recallBotId = booking.recall_bot_id;
  let recordingStatus = booking.recording_status;
  if (booking.recall_bot_id || booking.recording_status === "scheduled") {
    if (booking.recall_bot_id) { try { await stopBot(booking.recall_bot_id); } catch (e) { console.error("[scheduling/update] stop bot", e); } }
    recallBotId = null;
    if (!shouldScheduleRecordingBot(booking.meeting_provider, joinUrl)) recordingStatus = "skipped_no_meet";
    else if (isRecallConfigured()) {
      try {
        const bot = await scheduleBot({ meetingUrl: joinUrl as string, joinAtISO: new Date(startMs).toISOString(), botName: "Influencer Butler Notetaker", metadata: { bookingId: booking.id } });
        if (bot) { recallBotId = bot.id; recordingStatus = "scheduled"; } else { recordingStatus = "failed"; warnings.push("The recording bot could not be re-scheduled. Use Send recorder now before the call."); }
      } catch (e) { console.error("[scheduling/update] schedule bot", e); recordingStatus = "failed"; }
    }
  }

  const patch = {
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(endMs).toISOString(),
    user_ends_at: new Date(userEndMs).toISOString(),
    status: "confirmed",
    join_url: joinUrl,
    meeting_id: meetingId,
    recall_bot_id: recallBotId,
    recording_status: recordingStatus,
    // The reminders were stamped for the old time; clear them so they fire for the new one.
    reminded_24h_at: null,
    reminded_1h_at: null,
  };
  const { error: updErr } = await admin.from("call_bookings").update(patch).eq("id", booking.id);
  if (updErr) { console.error("[scheduling/update] reschedule", updErr.message); return NextResponse.json({ error: "Update failed" }, { status: 500 }); }

  let emailSent = false;
  if (body.sendEmail !== false) {
    try {
      emailSent = await sendRescheduled({
        id: booking.id, callType: booking.call_type, userEmail: booking.user_email, userName: booking.user_name,
        startMs, userEndMs, userTimezone: booking.user_timezone, topic: booking.topic, joinUrl,
      }, oldStartMs);
    } catch (e) { console.error("[scheduling/update] reschedule email", e); }
  }

  await logAdminAction({ actor, action: "scheduling.reschedule", targetType: "call_booking", targetId: booking.id, details: { from: booking.starts_at, to: patch.starts_at, force: body.force === true, emailed: emailSent } });
  return NextResponse.json({ ok: true, emailSent, joinUrl, warnings });
}
