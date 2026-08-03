/**
 * POST /api/admin/scheduling/update
 * Body: { id, action:'complete'|'no_show'|'cancel'|'notes'|'link'|'reschedule', ... }
 * Owner-side booking mutations. Gated by scheduling.manage, audited.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, loadConfig } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { sendCancellation, type BookingEmailData } from "@/lib/call-emails";
import { deleteMeetEvent } from "@/lib/google-meet";
import { stopBot } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { id?: string; action?: string; hostNotes?: string; joinUrl?: string; newStartMs?: number };

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
    .select("id,user_email,user_name,call_type,starts_at,user_ends_at,user_timezone,status,meeting_provider,meeting_id,recall_bot_id")
    .eq("id", id).maybeSingle();
  if (readErr || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (action === "complete") patch.status = "completed";
  else if (action === "no_show") patch.status = "no_show";
  else if (action === "cancel") { patch.status = "cancelled"; patch.cancelled_at = new Date().toISOString(); patch.recording_status = "none"; }
  else if (action === "notes") patch.host_notes = String(body.hostNotes ?? "").slice(0, 8000);
  else if (action === "link") patch.join_url = String(body.joinUrl ?? "").slice(0, 500);
  else if (action === "reschedule") {
    const startMs = Number(body.newStartMs);
    if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Bad time" }, { status: 400 });
    const ct = CALL_TYPES[booking.call_type as CallTypeKey];
    patch.starts_at = new Date(startMs).toISOString();
    patch.ends_at = new Date(startMs + ct.blockMinutes * 60_000).toISOString();
    patch.user_ends_at = new Date(startMs + ct.userMinutes * 60_000).toISOString();
    patch.status = "confirmed";
  } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const { error: updErr } = await admin.from("call_bookings").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  if (action === "cancel") {
    try {
      const data: BookingEmailData = {
        id: booking.id as string, callType: booking.call_type as CallTypeKey,
        userEmail: booking.user_email as string, userName: booking.user_name as string | null,
        startMs: Date.parse(booking.starts_at as string), userEndMs: Date.parse(booking.user_ends_at as string),
        userTimezone: booking.user_timezone as string | null,
      };
      await sendCancellation(data);
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

  await logAdminAction({ actor, action: `scheduling.${action}`, targetType: "call_booking", targetId: id, details: patch });
  return NextResponse.json({ ok: true });
}
