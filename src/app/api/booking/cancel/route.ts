/**
 * POST /api/booking/cancel  Body: { id, reason? }
 * Cancels the caller's own confirmed booking and emails a cancellation (+.ics).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, loadConfig } from "@/lib/scheduling-server";
import { sendCancellation, type BookingEmailData } from "@/lib/call-emails";
import { deleteMeetEvent } from "@/lib/google-meet";
import type { CallTypeKey } from "@/lib/scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { id?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: booking, error: readErr } = await admin
    .from("call_bookings")
    .select("id,user_id,user_email,user_name,call_type,starts_at,user_ends_at,user_timezone,status,meeting_provider,meeting_id")
    .eq("id", id).maybeSingle();
  if (readErr || !booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.user_id !== user.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  if (booking.status !== "confirmed") return NextResponse.json({ ok: true, alreadyCancelled: true });

  const { error: updErr } = await admin
    .from("call_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: (body.reason || "").slice(0, 500) })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "Could not cancel" }, { status: 500 });

  try {
    const data: BookingEmailData = {
      id: booking.id as string,
      callType: booking.call_type as CallTypeKey,
      userEmail: booking.user_email as string,
      userName: booking.user_name as string | null,
      startMs: Date.parse(booking.starts_at as string),
      userEndMs: Date.parse(booking.user_ends_at as string),
      userTimezone: booking.user_timezone as string | null,
    };
    await sendCancellation(data);
  } catch (e) { console.error("[booking/cancel] email", e); }

  if (booking.meeting_provider === "google_meet" && booking.meeting_id) {
    try { const cfg = await loadConfig(admin); if (cfg.googleRefreshToken) await deleteMeetEvent(cfg.googleRefreshToken, booking.meeting_id as string); }
    catch (e) { console.error("[booking/cancel] meet delete", e); }
  }

  return NextResponse.json({ ok: true });
}
