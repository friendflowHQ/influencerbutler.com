/**
 * POST /api/admin/events/update
 * Body: { id, title, description?, dateOptions: [{startsAt, endsAt}], timezone?,
 *         recordEnabled?, joinUrl?, isPrivate?, banner?: {...} }
 * Edits an existing event's details + banner config. Always targets exactly one
 * occurrence row (only dateOptions[0] is used) - sibling time options on a
 * multi-date event, if any, are untouched. Does not re-provision the Meet link
 * (set at create time); a manual joinUrl edit is honored, and when that link is
 * a Google Meet room on a recording-enabled event that has not ended, the Recall
 * bot is (re)scheduled for it so the call is recorded without a separate retry.
 * Gated by events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { sendEventJoinLink } from "@/lib/event-emails";
import {
  parseInvitePlan,
  parseReplayPlan,
  scheduleEventInvite,
  saveReplayPlan,
} from "@/lib/event-email-lifecycle";
import { scheduleBotResult, stopBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";
import { parseEventInput } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = ((raw as { id?: string })?.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = parseEventInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  // Editing always targets exactly one occurrence row - sibling time options
  // (if any) are untouched, so only the first dateOptions entry is used here.
  const [{ startMs, endMs }] = input.dateOptions;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Snapshot before the update, to tell whether the join link or recording
  // setting changed and whether a bot is already armed.
  const before = await getEvent(admin, id);

  const patch: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(endMs).toISOString(),
    timezone: input.timezone,
    record_enabled: input.recordEnabled,
    is_private: input.isPrivate,
    banner_enabled: input.banner.enabled,
    banner_text: input.banner.text,
    banner_cta_label: input.banner.ctaLabel,
    banner_starts_at: input.banner.startsAt,
    banner_ends_at: input.banner.endsAt,
    banner_surfaces: input.banner.surfaces,
  };
  // Only overwrite the join link when the admin supplied one, so we do not wipe
  // an auto-created Meet link on an edit that left the field blank.
  if (input.joinUrl) {
    patch.join_url = input.joinUrl;
    patch.meeting_provider = "manual";
  }

  const { data: prevRow } = await admin
    .from("events")
    .select("join_url,image_url")
    .eq("id", id)
    .maybeSingle();
  const prevJoinUrl = (prevRow as { join_url?: string | null } | null)?.join_url ?? null;

  const { error } = await admin.from("events").update(patch).eq("id", id);
  if (error) {
    console.error("[admin/events/update] update", error.message);
    return NextResponse.json({ error: "Could not update event." }, { status: 500 });
  }

  // Join link added or changed after the 1h reminder already went out: that
  // reminder told registrants "the join link will be emailed shortly", and the
  // hourly cron never sends it again, so email it now (fb-cd749461).
  let joinLinkSent = 0;
  const nowMs = Date.now();
  if (
    input.joinUrl &&
    input.joinUrl !== prevJoinUrl &&
    nowMs >= startMs - 75 * 60_000 &&
    nowMs < endMs
  ) {
    try {
      const { data: regs } = await admin
        .from("event_registrations")
        .select("user_email,user_name,user_timezone")
        .eq("event_id", id)
        .is("cancelled_at", null)
        .not("reminded_1h_at", "is", null);
      for (const r of (regs ?? []) as {
        user_email: string;
        user_name: string | null;
        user_timezone: string | null;
      }[]) {
        const ok = await sendEventJoinLink({
          id,
          title: input.title,
          description: input.description,
          startMs,
          endMs,
          joinUrl: input.joinUrl,
          toEmail: r.user_email,
          toName: r.user_name,
          timezone: r.user_timezone || input.timezone,
          imageUrl: (prevRow as { image_url?: string | null } | null)?.image_url ?? null,
        });
        if (ok) joinLinkSent++;
      }
    } catch (e) {
      console.error("[admin/events/update] join-link follow-up", e);
    }
  }

  // Recording (best-effort): a pasted Meet link used to leave recording at
  // 'skipped_no_meet' with no bot, and the call went unrecorded. Arm the bot
  // when the event now has a recordable link and either the link changed,
  // recording was just turned on, or no bot is armed yet.
  let recordingStatus: string | null = null;
  try {
    const joinUrl = input.joinUrl ?? before?.joinUrl ?? null;
    const provider = input.joinUrl ? "manual" : before?.meetingProvider ?? null;
    const linkChanged = !!input.joinUrl && input.joinUrl !== before?.joinUrl;
    const turnedOn = input.recordEnabled && !before?.recordEnabled;
    const armed = before?.recordingStatus === "scheduled" && !!before?.recallBotId;
    if (
      input.recordEnabled &&
      endMs > Date.now() &&
      shouldScheduleRecordingBot(provider, joinUrl) &&
      isRecallConfigured() &&
      (linkChanged || turnedOn || !armed)
    ) {
      if (before?.recallBotId) {
        try { await stopBot(before.recallBotId); } catch (e) { console.error("[admin/events/update] stop stale bot", e); }
      }
      const result = await scheduleBotResult({
        meetingUrl: joinUrl as string, // shouldScheduleRecordingBot guarantees non-null
        joinAtISO: new Date(startMs).toISOString(),
        botName: "Influencer Butler Notetaker",
        metadata: { eventId: id },
      });
      recordingStatus = result.bot ? "scheduled" : "failed";
      const { error: recErr } = await admin
        .from("events")
        .update({ recall_bot_id: result.bot?.id ?? null, recording_status: recordingStatus })
        .eq("id", id);
      if (recErr) console.error("[admin/events/update] recording status", recErr.message);
    }
  } catch (e) {
    console.error("[admin/events/update] recording", e);
  }

  // Email lifecycle (best-effort): persist the replay plan, and schedule an
  // invite campaign if one is requested and this event does not already have
  // one (so re-saving an event never creates duplicate invites).
  try {
    const replayPlan = parseReplayPlan((raw as { replay?: unknown }).replay);
    if (replayPlan) await saveReplayPlan(admin, id, replayPlan);

    const invitePlan = parseInvitePlan((raw as { invite?: unknown }).invite);
    if (invitePlan) {
      const existing = await getEvent(admin, id);
      if (!existing?.inviteCampaignId) {
        await scheduleEventInvite(admin, {
          event: {
            id,
            title: input.title,
            description: input.description,
            startMs,
            endMs,
            timezone: input.timezone,
          },
          plan: invitePlan,
          createdBy: actor.email,
        });
      }
    }
  } catch (e) {
    console.error("[admin/events/update] lifecycle", e);
  }

  await logAdminAction({
    actor,
    action: "event.update",
    targetType: "event",
    targetId: id,
    details: { title: input.title, bannerEnabled: input.banner.enabled, joinLinkSent },
  });

  return NextResponse.json({ ok: true, joinLinkSent });
}
