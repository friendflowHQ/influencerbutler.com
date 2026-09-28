/**
 * GET /api/admin/events/registrations?id=<eventId>
 * The RSVP list for an event plus the event's recording state + AI recap notes.
 * Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, getEvent, listRegistrations } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const registrations = await listRegistrations(admin, id);

  return NextResponse.json({
    ok: true,
    event: {
      id: event.id,
      title: event.title,
      recordingStatus: event.recordingStatus,
      recordingUrl: event.recordingUrl,
      aiNotes: event.aiNotes,
      recordedAt: event.recordedAt,
      highlightsEmailedAt: event.highlightsEmailedAt,
    },
    registrations: registrations.map((r) => ({
      email: r.userEmail,
      name: r.userName,
      registeredAt: r.registeredAt,
      cancelled: !!r.cancelledAt,
    })),
  });
}
