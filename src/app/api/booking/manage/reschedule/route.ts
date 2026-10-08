/**
 * POST /api/booking/manage/reschedule  Body: { id, t, startMs }
 * Customer moves their own call via the emailed link. Re-validates the slot on
 * the server (never trusts the client), then moves the Meet event + recording
 * bot, resets reminders, emails the customer an updated invite and alerts the owner.
 */
import { NextResponse } from "next/server";
import { validateSlot } from "@/lib/scheduling-server";
import { moveBooking } from "@/lib/call-actions";
import { canChange, loadManageable, ownEventOf } from "@/lib/call-manage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { id?: string; t?: string; startMs?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const r = await loadManageable((body.id || "").trim(), (body.t || "").trim());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const b = r.booking;
  if (!canChange(b)) return NextResponse.json({ error: "This call can no longer be changed." }, { status: 409 });

  const startMs = Number(body.startMs);
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Bad time" }, { status: 400 });
  if (startMs === Date.parse(b.starts_at)) return NextResponse.json({ error: "That is your current time. Pick a different one." }, { status: 400 });

  const v = await validateSlot(r.admin, b.call_type, startMs, Date.now(), { excludeBookingId: b.id, ownEvent: ownEventOf(b) });
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 409 });

  const res = await moveBooking(r.admin, b, startMs, { sendEmail: true, notifyOwner: true });
  if (!res.ok) return NextResponse.json({ error: "Could not move that call. Please try again." }, { status: res.status });
  return NextResponse.json({ ok: true, startMs: res.startMs, userEndMs: res.userEndMs, joinUrl: res.joinUrl });
}
