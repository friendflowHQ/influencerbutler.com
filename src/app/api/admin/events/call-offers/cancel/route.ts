/**
 * POST /api/admin/events/call-offers/cancel
 * Body: { offerId: string }
 * Cancels an unclaimed (open) offer, freeing the time immediately. A claimed
 * offer is cancelled via the normal booking-cancel flow (Scheduling console),
 * which also reopens its offer - see cancelBooking() in call-actions.ts.
 * Gated by events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, cancelEventCallOffer } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { offerId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const offerId = (body.offerId || "").trim();
  if (!offerId) return NextResponse.json({ error: "Bad offer" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const ok = await cancelEventCallOffer(admin, offerId);
  if (!ok) return NextResponse.json({ error: "Could not cancel that offer." }, { status: 500 });

  await logAdminAction({ actor, action: "event.call_offers.cancel", targetType: "event_call_offer", targetId: offerId, details: {} });
  return NextResponse.json({ ok: true });
}
