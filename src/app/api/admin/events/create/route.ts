/**
 * POST /api/admin/events/create
 * Body: { title, description?, dateOptions: [{startsAt, endsAt}, ...], timezone?,
 *         recordEnabled?, joinUrl?, isPrivate?, banner?: {...} }
 * Creates a group event. When more than one dateOptions entry is given, this
 * creates one `events` row per time - "pick one of several times" - all
 * sharing a series_id so the share page can list them together; a single
 * dateOptions entry behaves exactly as a normal single-date event (no
 * series_id). Each occurrence auto-creates its own Google Meet link (when the
 * owner's calendar is connected and no manual joinUrl is supplied - a manual
 * link is reused verbatim across every occurrence), then schedules its own
 * Recall.ai recording bot. Gated by events.manage; audit-logged. Mirrors the
 * Meet + Recall wiring in src/app/api/booking/create/route.ts.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { createMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { scheduleBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";
import { ownerNotifyEmail } from "@/lib/call-emails";
import {
  parseInvitePlan,
  parseReplayPlan,
  scheduleEventInvite,
  saveReplayPlan,
} from "@/lib/event-email-lifecycle";
import { parseEventInput, type DateOption, type EventInput } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Actor = Awaited<ReturnType<typeof requirePermission>>;

/** Creates one occurrence row (Meet/Recall/insert/lifecycle) for a single date option. */
async function createOccurrence({
  admin,
  actor,
  input,
  option,
  seriesId,
  googleRefreshToken,
  googleCalendarEmail,
  raw,
}: {
  admin: NonNullable<ReturnType<typeof getAdmin>>;
  actor: NonNullable<Actor>;
  input: EventInput;
  option: DateOption;
  seriesId: string | null;
  googleRefreshToken: string | null;
  googleCalendarEmail: string | null;
  raw: unknown;
}): Promise<{ id: string; joinUrl: string | null } | { error: string }> {
  // Video link: a Google Meet on the owner's calendar if connected (and no
  // manual link supplied), else the manual link the admin entered, reused for
  // every occurrence.
  let joinUrl: string | null = input.joinUrl;
  let provider: string | null = input.joinUrl ? "manual" : null;
  let meetingId: string | null = null;
  if (!joinUrl && googleRefreshToken) {
    const m = await createMeetEvent({
      refreshToken: googleRefreshToken,
      summary: input.title,
      description: input.description || undefined,
      startMs: option.startMs,
      endMs: option.endMs,
      attendeeEmail: googleCalendarEmail || ownerNotifyEmail() || "hello@influencerbutler.com",
    });
    if (m) {
      joinUrl = m.joinUrl;
      provider = "google_meet";
      meetingId = m.meetingId;
    }
  }

  const { data: inserted, error } = await admin
    .from("events")
    .insert({
      title: input.title,
      description: input.description,
      starts_at: new Date(option.startMs).toISOString(),
      ends_at: new Date(option.endMs).toISOString(),
      timezone: input.timezone,
      status: "scheduled",
      created_by: actor.userId,
      join_url: joinUrl,
      meeting_provider: provider,
      meeting_id: meetingId,
      record_enabled: input.recordEnabled,
      is_private: input.isPrivate,
      series_id: seriesId,
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
    return { error: "Could not create event." };
  }
  const eventId = String(inserted.id);

  // Schedule a Recall bot to record + transcribe. Best-effort: never fails the
  // event. Only for a real Google Meet room (a manual link has no room a bot can
  // join), and skipped entirely when recording is off or Recall is unconfigured.
  let recordingStatus = "none";
  let recallBotId: string | null = null;
  if (!input.recordEnabled) {
    recordingStatus = "none";
  } else if (!shouldScheduleRecordingBot(provider, joinUrl)) {
    recordingStatus = "skipped_no_meet";
  } else if (isRecallConfigured()) {
    const bot = await scheduleBot({
      meetingUrl: joinUrl as string, // shouldScheduleRecordingBot guarantees non-null
      joinAtISO: new Date(option.startMs).toISOString(),
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

  // Email lifecycle (best-effort, never blocks event creation): schedule the
  // invite campaign for the chosen audience, and persist the replay follow-up
  // plan. Each occurrence gets its own invite/replay tied to its own time. The
  // 24h/1h reminders are handled by cron/event-reminders already.
  let inviteCampaignId: string | null = null;
  try {
    const invitePlan = parseInvitePlan((raw as { invite?: unknown }).invite);
    if (invitePlan) {
      const res = await scheduleEventInvite(admin, {
        event: {
          id: eventId,
          title: input.title,
          description: input.description,
          startMs: option.startMs,
          endMs: option.endMs,
          timezone: input.timezone,
        },
        plan: invitePlan,
        createdBy: actor.email,
      });
      inviteCampaignId = res.campaignId;
    }
    const replayPlan = parseReplayPlan((raw as { replay?: unknown }).replay);
    if (replayPlan) await saveReplayPlan(admin, eventId, replayPlan);
  } catch (e) {
    console.error("[admin/events/create] lifecycle", e);
  }

  await logAdminAction({
    actor,
    action: "event.create",
    targetType: "event",
    targetId: eventId,
    details: { title: input.title, provider, recordingStatus, inviteCampaignId, seriesId },
  });

  return { id: eventId, joinUrl };
}

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

  let googleRefreshToken: string | null = null;
  let googleCalendarEmail: string | null = null;
  if (!input.joinUrl && isGoogleConfigured()) {
    const cfg = await loadConfig(admin);
    googleRefreshToken = cfg.googleRefreshToken || null;
    googleCalendarEmail = cfg.googleCalendarEmail || null;
  }

  const seriesId = input.dateOptions.length > 1 ? crypto.randomUUID() : null;

  const ids: string[] = [];
  let firstJoinUrl: string | null = null;
  for (const option of input.dateOptions) {
    const result = await createOccurrence({
      admin,
      actor,
      input,
      option,
      seriesId,
      googleRefreshToken,
      googleCalendarEmail,
      raw,
    });
    if ("error" in result) {
      // Partial failure mid-series: report what was created so the admin isn't
      // left guessing, rather than silently losing the earlier occurrences.
      return NextResponse.json(
        { error: result.error, createdIds: ids, seriesId },
        { status: 500 },
      );
    }
    ids.push(result.id);
    if (firstJoinUrl === null) firstJoinUrl = result.joinUrl;
  }

  return NextResponse.json({ ok: true, id: ids[0], ids, seriesId, joinUrl: firstJoinUrl });
}
