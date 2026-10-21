/**
 * POST /api/admin/events/call-offers/suggest
 * Body: { eventId: string, count: number }
 * Computes candidate 1:1 follow-up call times for an event - writes nothing.
 * Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, suggestEventFollowupSlots } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { eventId?: string; count?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = (body.eventId || "").trim();
  const count = Number(body.count);
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });
  if (!Number.isFinite(count) || count < 1) return NextResponse.json({ error: "Pick at least 1 call to open." }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const result = await suggestEventFollowupSlots(admin, { eventId, count });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    slots: result.slots.map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
  });
}
