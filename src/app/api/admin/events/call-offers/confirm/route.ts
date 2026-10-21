/**
 * POST /api/admin/events/call-offers/confirm
 * Body: { eventId: string, slots: [{startMs, endMs}, ...] }
 * Re-validates each proposed time against the live calendar and holds every
 * still-available one as an open offer. Partial success is normal - some
 * proposed times may have been taken between suggest and confirm. Gated by
 * events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, confirmEventFollowupSlots } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { eventId?: string; slots?: Array<{ startMs?: number; endMs?: number }> };

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = (body.eventId || "").trim();
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const slots = (Array.isArray(body.slots) ? body.slots : [])
    .map((s) => ({ startMs: Number(s.startMs), endMs: Number(s.endMs) }))
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .slice(0, 20);
  if (slots.length === 0) return NextResponse.json({ error: "No valid times given." }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { created, skipped } = await confirmEventFollowupSlots(admin, { eventId, slots });

  await logAdminAction({
    actor,
    action: "event.call_offers.confirm",
    targetType: "event",
    targetId: eventId,
    details: { requested: slots.length, created: created.length, skipped: skipped.length },
  });

  return NextResponse.json({ ok: true, created, skipped });
}
