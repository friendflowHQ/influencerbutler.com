/**
 * POST /api/booking/manage/cancel  Body: { id, t, reason? }
 * Customer cancels their own call via the emailed link. Idempotent: a second
 * click (or a second email's link) reports success without re-emailing.
 */
import { NextResponse } from "next/server";
import { cancelBooking } from "@/lib/call-actions";
import { loadManageable } from "@/lib/call-manage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { id?: string; t?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const r = await loadManageable((body.id || "").trim(), (body.t || "").trim());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const b = r.booking;
  if (b.status === "cancelled") return NextResponse.json({ ok: true, alreadyCancelled: true });
  if (b.status !== "confirmed" || Date.parse(b.starts_at) <= Date.now()) {
    return NextResponse.json({ error: "This call can no longer be changed." }, { status: 409 });
  }
  const res = await cancelBooking(r.admin, b, { reason: body.reason, notifyOwner: true });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, alreadyCancelled: res.alreadyCancelled });
}
