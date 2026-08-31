/**
 * POST /api/admin/scheduling/meet
 * Body: { type:'support'|'demo', startMs, email, topic? }
 * Creates a Google Meet room on the owner's calendar for the given window and
 * returns { joinUrl, meetingId } so the Add-call form can fill the join link
 * without the owner making one by hand. Gated by scheduling.manage.
 *
 * Requires Google Calendar to be connected (Availability & settings). This only
 * mints the Meet room; the booking is persisted separately by the create route,
 * which is passed the returned meetingId so cancel/recording stay wired up.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, loadConfig } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { createMeetEvent, isGoogleConfigured } from "@/lib/google-meet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { type?: string; startMs?: number; email?: string; topic?: string };

export async function POST(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const type = body.type === "support" || body.type === "demo" ? (body.type as CallTypeKey) : null;
  if (!type) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  const startMs = Number(body.startMs);
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Pick a start time first." }, { status: 400 });
  const email = (body.email || "").trim().slice(0, 200);
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter the customer email first." }, { status: 400 });

  const ct = CALL_TYPES[type];
  const topic = (body.topic || "").trim().slice(0, 2000);

  const cfg = await loadConfig(admin);
  if (!isGoogleConfigured() || !cfg.googleRefreshToken) {
    return NextResponse.json({ error: "Connect Google Calendar under Availability & settings first, then generate a link." }, { status: 400 });
  }

  const m = await createMeetEvent({
    refreshToken: cfg.googleRefreshToken,
    summary: `${ct.label} with Influencer Butler`,
    description: topic || undefined,
    startMs,
    endMs: startMs + ct.userMinutes * 60_000,
    attendeeEmail: email,
  });
  if (!m) return NextResponse.json({ error: "Could not create a Meet link. Check the Google connection and try again." }, { status: 502 });

  return NextResponse.json({ ok: true, joinUrl: m.joinUrl, meetingId: m.meetingId });
}
