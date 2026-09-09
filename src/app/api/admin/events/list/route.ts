/**
 * GET /api/admin/events/list
 * All events (newest first) with active registration counts. Gated by
 * events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, listEvents, registrationCounts } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const events = await listEvents(admin);
  const counts = await registrationCounts(admin, events.map((e) => e.id));

  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({ ...e, registrations: counts[e.id] ?? 0 })),
  });
}
