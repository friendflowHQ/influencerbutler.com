/**
 * POST /api/booking/cancel  Body: { id, reason? }
 * Cancels the caller's own confirmed booking and emails a cancellation (+.ics).
 * Shares cancelBooking with the emailed manage link, so the Meet event is
 * removed, the recording bot is stopped and the owner is told either way.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/scheduling-server";
import { BOOKING_ROW_COLS, cancelBooking, type BookingRow } from "@/lib/call-actions";

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

  const { data, error: readErr } = await admin
    .from("call_bookings")
    .select(`${BOOKING_ROW_COLS},user_id`)
    .eq("id", id).maybeSingle();
  if (readErr || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const booking = data as unknown as BookingRow & { user_id: string | null };
  if (booking.user_id !== user.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  if (booking.status !== "confirmed") return NextResponse.json({ ok: true, alreadyCancelled: true });

  const res = await cancelBooking(admin, booking, { reason: body.reason, notifyOwner: true });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
