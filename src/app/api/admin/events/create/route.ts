/**
 * POST /api/admin/events/create
 * Body: { title, description?, startsAt (ISO), endsAt (ISO), timezone?,
 *         recordEnabled?, joinUrl?, banner?: {...} }
 * Creates a group event. Auto-creates a Google Meet link (when the owner's
 * calendar is connected, unless a manual joinUrl is supplied), then schedules a
 * Recall.ai recording bot. Gated by events.manage; audit-logged. Mirrors the
 * Meet + Recall wiring in src/app/api/booking/create/route.ts.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { createMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { scheduleBot, isRecallConfigured } from "@/lib/recall";
import { ownerNotifyEmail } from "@/lib/call-emails";
import { parseEventInput, type EventInput } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseEventInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input: EventInput = parsed.value;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Video link: a Google Meet on the owner's calendar if connected (and no
  // manual link supplied), else the manual link the admin entered.
  let joinUrl: string | null = input.joinUrl;
  let provider: string | null = input.joinUrl ? "manual" : null;
  let meetingId: string | null = null;
  if (!joinUrl && isGoogleConfigured()) {
    const cfg = await loadConfig(admin);
    if (cfg.googleRefreshToken) {
      const m = await createMeetEvent({
        refreshToken: cfg.googleRefreshToken,
        summary: input.title,
        description: input.description || undefined,
        startMs: input.startMs,
        endMs: input.endMs,
        attendeeEmail: cfg.googleCalendarEmail || ownerNotifyEmail() || "hello@influencerbutler.com",
      });
      if (m) {
        joinUrl = m.joinUrl;
        provider = "google_meet";
        meetingId = m.meetingId;
      }
    }
  }

  const { data: inserted, error } = await admin
    .from("events")
    .insert({
      title: input.title,
      description: input.description,
      starts_at: new Date(input.startMs).toISOString(),
      ends_at: new Date(input.endMs).toISOString(),
      timezone: input.timezone,
      status: "scheduled",
      created_by: actor.userId,
      join_url: joinUrl,
      meeting_provider: provider,
      meeting_id: meetingId,
      record_enabled: input.recordEnabled,
      banner_enabled: input.banner.enabled,
      banner_text: input.banner.text,
      banner_cta_label: input.banner.ctaLabel,
      banner_starts_at: input.banner.startsAt,
      banner_ends_at: input.banner.endsAt,
      banner_surfaces: input.banner.surfaces,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) {
    console.error("[admin/events/create] insert", error?.message);
    return NextResponse.json({ error: "Could not create event." }, { status: 500 });
  }
  const eventId = String(inserted.id);

  // Schedule a Recall bot to record + transcribe. Best-effort: never fails the
  // event. Only for a real Google Meet room (a manual link has no room a bot can
  // join), and skipped entirely when recording is off or Recall is unconfigured.
  let recordingStatus = "none";
  let recallBotId: string | null = null;
  if (!input.recordEnabled) {
    recordingStatus = "none";
  } else if (provider !== "google_meet" || !joinUrl) {
    recordingStatus = "skipped_no_meet";
  } else if (isRecallConfigured()) {
    const bot = await scheduleBot({
      meetingUrl: joinUrl,
      joinAtISO: new Date(input.startMs).toISOString(),
      botName: "Influencer Butler Notetaker",
      metadata: { eventId },
    });
    if (bot) {
      recallBotId = bot.id;
      recordingStatus = "scheduled";
    } else recordingStatus = "failed";
  }
  if (recordingStatus !== "none") {
    try {
      await admin
        .from("events")
        .update({ recall_bot_id: recallBotId, recording_status: recordingStatus })
        .eq("id", eventId);
    } catch (e) {
      console.error("[admin/events/create] recording status update", e);
    }
  }

  await logAdminAction({
    actor,
    action: "event.create",
    targetType: "event",
    targetId: eventId,
    details: { title: input.title, provider, recordingStatus },
  });

  return NextResponse.json({ ok: true, id: eventId, joinUrl });
}
