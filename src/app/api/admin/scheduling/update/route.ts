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
import { type CallTypeKey } from "@/lib/scheduling";
import { sendCancellation, sendMissedYou, sendLinkAttached, type BookingEmailData } from "@/lib/call-emails";
import { deleteMeetEvent } from "@/lib/google-meet";
import { stopBot } from "@/lib/recall";
import { moveBooking, type BookingRow } from "@/lib/call-actions";

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

/**
 * Owner-side move: refuses a past time and (unless force) a conflict, then hands
 * the actual move (Meet event, recording bot, reminders, email) to moveBooking.
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

  if (body.force !== true) {
    const own = booking.meeting_provider === "google_meet" ? { startMs: oldStartMs, endMs: Date.parse(booking.user_ends_at) } : null;
    const chk = await checkMove(admin, booking.call_type, booking.id, startMs, Date.now(), own);
    if (!chk.ok) return NextResponse.json({ error: chk.reason }, { status: 409 });
  }

  const res = await moveBooking(admin, booking, startMs, { sendEmail: body.sendEmail !== false });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await logAdminAction({ actor, action: "scheduling.reschedule", targetType: "call_booking", targetId: booking.id, details: { from: booking.starts_at, to: new Date(startMs).toISOString(), force: body.force === true, emailed: res.emailSent } });
  return NextResponse.json({ ok: true, emailSent: res.emailSent, joinUrl: res.joinUrl, warnings: res.warnings });
}
