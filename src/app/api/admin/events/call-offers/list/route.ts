/**
 * GET /api/admin/events/call-offers/list?eventId=
 * Lists every 1:1 follow-up call offer (open/claimed/cancelled) for an event.
 * Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, listEventCallOffers } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const eventId = (new URL(request.url).searchParams.get("eventId") || "").trim();
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const offers = await listEventCallOffers(admin, eventId);
  return NextResponse.json({ ok: true, offers });
}
