/**
 * GET /api/booking/manage?id=<bookingId>&t=<token>
 * What the manage page shows. Token-gated (no login). Returns only what the
 * customer already received in their confirmation email.
 */
import { NextResponse } from "next/server";
import { CALL_TYPES } from "@/lib/scheduling";
import { canChange, loadManageable } from "@/lib/call-manage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const r = await loadManageable((p.get("id") || "").trim(), (p.get("t") || "").trim());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const b = r.booking;
  const ct = CALL_TYPES[b.call_type];
  return NextResponse.json({
    callType: b.call_type,
    label: ct.label,
    userMinutes: ct.userMinutes,
    startMs: Date.parse(b.starts_at),
    userEndMs: Date.parse(b.user_ends_at),
    status: b.status,
    joinUrl: b.status === "confirmed" ? b.join_url : null,
    canChange: canChange(b),
  });
}
