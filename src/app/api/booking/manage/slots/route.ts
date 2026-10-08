/**
 * GET /api/booking/manage/slots?id=<bookingId>&t=<token>
 * Open slots for moving this booking. Same availability the booking page offers
 * (windows, decoys, lead time, other calls), except the booking's own current
 * slot does not count as busy.
 */
import { NextResponse } from "next/server";
import { availabilityForType } from "@/lib/scheduling-server";
import { canChange, loadManageable, ownEventOf } from "@/lib/call-manage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const r = await loadManageable((p.get("id") || "").trim(), (p.get("t") || "").trim());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!canChange(r.booking)) return NextResponse.json({ error: "This call can no longer be changed." }, { status: 409 });
  const days = await availabilityForType(r.admin, r.booking.call_type, Date.now(), { excludeBookingId: r.booking.id, ownEvent: ownEventOf(r.booking) });
  return NextResponse.json({ days });
}
