/**
 * POST /api/admin/events/cancel
 * Body: { id }
 * Cancels an event: flips status to 'cancelled', best-effort removes the Google
 * Meet calendar event and stops the Recall bot. Gated by events.manage;
 * audit-logged. Registrations are kept (so the RSVP history stays), but the
 * banner and reminders stop because they only fire for 'scheduled' events.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { deleteMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { stopBot } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Body = { id?: string };

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("events")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[admin/events/cancel] update", error.message);
    return NextResponse.json({ error: "Could not cancel event." }, { status: 500 });
  }

  // Best-effort teardown of the Meet event + recording bot.
  try {
    if (event.meetingProvider === "google_meet" && event.meetingId && isGoogleConfigured()) {
      const cfg = await loadConfig(admin);
      if (cfg.googleRefreshToken) await deleteMeetEvent(cfg.googleRefreshToken, event.meetingId);
    }
  } catch (e) {
    console.error("[admin/events/cancel] delete meet", e);
  }
  try {
    if (event.recallBotId) await stopBot(event.recallBotId);
  } catch (e) {
    console.error("[admin/events/cancel] stop bot", e);
  }

  await logAdminAction({ actor, action: "event.cancel", targetType: "event", targetId: id });

  return NextResponse.json({ ok: true });
}
