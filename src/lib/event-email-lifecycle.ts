/**
 * Per-event email lifecycle: the two ends of the funnel around a group event.
 *
 *   Invite  : an announcement campaign, scheduled to go out N days before the
 *             event, driving registrations. It is a normal email_campaigns row,
 *             so the existing marketing cron materializes + sends it (throttled,
 *             suppression-safe, tracked). We just create the row and remember
 *             the link on the event.
 *   Replay  : a short follow-up to registrants with the replay video link, sent
 *             once, replay_hours_after hours after the event ends, and only once
 *             a YouTube (or recording) link exists. Idempotent via
 *             events.replay_emailed_at, mirroring the reminder stamps.
 *
 * The 24h/1h reminders to registrants are handled separately by
 * cron/event-reminders and are unchanged.
 *
 * All DB helpers are best-effort and tolerant of the 20260917 migration not
 * being applied yet (they detect the missing column and no-op), so a deploy
 * that lands before the migration degrades rather than throwing.
 */
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAudience, type Audience } from "@/lib/email-audience";
import { activeRegistrations } from "@/lib/events";
import { sendEventReplay, type EventEmailData } from "@/lib/event-emails";

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// A scheduled invite is never fired sooner than this from now, so the admin has
// a window to review or cancel it in the Campaigns tab before it goes out.
const INVITE_MIN_BUFFER_MS = 60 * 60 * 1000;
// The replay cron only looks this far back, so enabling the feature never
// backfills a blast of replay emails to registrants of long-past events.
const REPLAY_LOOKBACK_MS = 7 * DAY_MS;

export type InvitePlan = {
  audience: Audience;
  daysBefore: number;
  subject: string | null;
  body: string | null;
};

export type ReplayPlan = {
  enabled: boolean;
  hoursAfter: number;
  subject: string | null;
  body: string | null;
};

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Public register/share page for an event. */
export function eventShareUrl(eventId: string): string {
  return `${SITE}/events/${eventId}`;
}

/**
 * When the invite campaign should send: daysBefore days before the event, but
 * never in the past and never inside the review buffer, and never so late that
 * it would land at or after the event start. Returns null when there is no room
 * to send an invite before the event (event already started, or too soon).
 */
export function inviteScheduledAtMs(
  startMs: number,
  daysBefore: number,
  nowMs: number,
  minBufferMs: number = INVITE_MIN_BUFFER_MS,
): number | null {
  if (!Number.isFinite(startMs) || startMs <= nowMs) return null;
  const target = startMs - Math.max(0, daysBefore) * DAY_MS;
  const earliest = nowMs + minBufferMs;
  const scheduled = Math.max(target, earliest);
  // Leave at least a small margin before the event begins.
  if (scheduled >= startMs) return null;
  return scheduled;
}

/** True when the replay follow-up is due: hoursAfter hours past the end. */
export function replayDue(endMs: number, hoursAfter: number, nowMs: number): boolean {
  if (!Number.isFinite(endMs)) return false;
  return nowMs >= endMs + Math.max(0, hoursAfter) * HOUR_MS;
}

/** Default invite subject + plain-text body (campaign copy) for an event. */
export function defaultInviteCopy(
  event: { id: string; title: string; description?: string | null; startMs: number; endMs: number; timezone?: string | null },
): { subject: string; body: string } {
  const tz = event.timezone || "America/Denver";
  const start = DateTime.fromMillis(event.startMs, { zone: tz });
  const end = DateTime.fromMillis(event.endMs, { zone: tz });
  const dateLine = start.toFormat("cccc, LLLL d");
  const timeLine = `${start.toFormat("h:mm a")} to ${end.toFormat("h:mm a")} ${start.toFormat("ZZZZ")}`;
  const blurb = (event.description || "").trim();
  const body = [
    `Hi,`,
    ``,
    `You are invited to a free live session: ${event.title}.`,
    ``,
    event.title,
    dateLine,
    timeLine,
    ...(blurb ? ["", blurb] : []),
    ``,
    `Save your spot:`,
    eventShareUrl(event.id),
    ``,
    `Can't make it live? Register anyway and we will send you the replay afterward.`,
    ``,
    `See you there,`,
    `The Influencer Butler team`,
  ].join("\n");
  return { subject: `You are invited: ${event.title}`, body };
}

// ── Input parsing (from the admin form) ─────────────────────────────────────

const MAX_DAYS_BEFORE = 60;
const MAX_HOURS_AFTER = 240;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

/** Parses the optional invite plan on an event create/update body. Returns null
 * when no invite is requested (or the audience is unusable). */
export function parseInvitePlan(raw: unknown): InvitePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.enabled === false) return null;
  const audience = parseAudience(b.audience);
  if (!audience) return null;
  return {
    audience,
    daysBefore: clampInt(b.daysBefore, 0, MAX_DAYS_BEFORE, 7),
    subject: typeof b.subject === "string" && b.subject.trim() ? b.subject.trim().slice(0, 200) : null,
    body: typeof b.body === "string" && b.body.trim() ? b.body.slice(0, 10000) : null,
  };
}

/** Parses the optional replay plan. `enabled:false` disables the follow-up
 * (stored as a null hoursAfter). Absent input leaves the DB default in place. */
export function parseReplayPlan(raw: unknown): ReplayPlan | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const enabled = b.enabled !== false;
  return {
    enabled,
    hoursAfter: clampInt(b.hoursAfter, 1, MAX_HOURS_AFTER, 3),
    subject: typeof b.subject === "string" && b.subject.trim() ? b.subject.trim().slice(0, 200) : null,
    body: typeof b.body === "string" && b.body.trim() ? b.body.slice(0, 10000) : null,
  };
}

// ── DB operations ───────────────────────────────────────────────────────────

/**
 * Creates the scheduled invite campaign for an event and links it back onto the
 * event row. Best-effort: returns the campaign id on success, or null (and logs)
 * on any failure, so it never blocks event creation. The campaign is a normal
 * scheduled draft, so the admin can review, edit, or cancel it in Emails >
 * Campaigns before it sends.
 */
export async function scheduleEventInvite(
  admin: SupabaseClient,
  args: {
    event: { id: string; title: string; description?: string | null; startMs: number; endMs: number; timezone?: string | null };
    plan: InvitePlan;
    createdBy: string;
    nowMs?: number;
  },
): Promise<{ campaignId: string | null; reason?: string }> {
  const nowMs = args.nowMs ?? Date.now();
  const scheduledMs = inviteScheduledAtMs(args.event.startMs, args.plan.daysBefore, nowMs);
  if (scheduledMs === null) return { campaignId: null, reason: "too_late" };

  const fallback = defaultInviteCopy(args.event);
  const subject = args.plan.subject || fallback.subject;
  // Custom bodies (hand-written or AI-drafted) may reference the register page
  // with an {{EVENT_URL}} token, since the event id is only known here. Always
  // guarantee the share link is present so a bad template can never drop it.
  const shareUrl = eventShareUrl(args.event.id);
  let body = args.plan.body || fallback.body;
  body = body.split("{{EVENT_URL}}").join(shareUrl);
  if (!body.includes(shareUrl)) body += `\n\nSave your spot: ${shareUrl}`;

  const insert: Record<string, unknown> = {
    name: `Event invite: ${args.event.title}`.slice(0, 200),
    subject,
    body,
    audience: args.plan.audience,
    status: "draft",
    scheduled_at: new Date(scheduledMs).toISOString(),
    created_by: args.createdBy,
    stream: "lifecycle",
  };
  let { data, error } = await admin.from("email_campaigns").insert(insert).select("id").single();
  if (error) {
    // Retry without the optional stream column if the stream migration lags.
    const noStream = { ...insert };
    delete noStream.stream;
    ({ data, error } = await admin.from("email_campaigns").insert(noStream).select("id").single());
  }
  if (error || !data?.id) {
    console.error("[event-lifecycle] scheduleEventInvite insert", error?.message);
    return { campaignId: null, reason: "insert_failed" };
  }
  const campaignId = String(data.id);

  // Link the campaign + remember the chosen plan on the event (best-effort;
  // tolerated if the lifecycle migration has not been applied).
  const { error: linkErr } = await admin
    .from("events")
    .update({
      invite_campaign_id: campaignId,
      invite_audience: args.plan.audience,
      invite_days_before: args.plan.daysBefore,
    })
    .eq("id", args.event.id);
  if (linkErr) console.error("[event-lifecycle] scheduleEventInvite link", linkErr.message);

  return { campaignId };
}

/** Persists the replay plan onto an event (best-effort, migration-tolerant). */
export async function saveReplayPlan(
  admin: SupabaseClient,
  eventId: string,
  plan: ReplayPlan,
): Promise<void> {
  const { error } = await admin
    .from("events")
    .update({
      replay_hours_after: plan.enabled ? plan.hoursAfter : null,
      replay_subject: plan.subject,
      replay_body: plan.body,
    })
    .eq("id", eventId);
  if (error) console.error("[event-lifecycle] saveReplayPlan", error.message);
}

type ReplayEventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  join_url: string | null;
  image_url: string | null;
  youtube_url: string | null;
  recording_url: string | null;
  replay_subject: string | null;
  replay_body: string | null;
  replay_hours_after: number | null;
  replay_emailed_at: string | null;
};

const REPLAY_SELECT =
  "id,title,description,starts_at,ends_at,timezone,join_url,image_url," +
  "youtube_url,recording_url,replay_subject,replay_body,replay_hours_after,replay_emailed_at";

/**
 * Sends the replay follow-up for any recently-ended event that is due, has a
 * replay link, has the follow-up enabled (replay_hours_after not null), and has
 * not been emailed yet. One email per active registrant, then the event is
 * stamped so it never re-sends. Returns per-run counts; skipped:true when the
 * lifecycle migration has not been applied (so the caller can no-op cleanly).
 */
export async function sendEventReplays(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<{ skipped?: boolean; events: number; sent: number }> {
  const nowIso = new Date(nowMs).toISOString();
  const sinceIso = new Date(nowMs - REPLAY_LOOKBACK_MS).toISOString();

  const { data, error } = await admin
    .from("events")
    .select(REPLAY_SELECT)
    .lte("ends_at", nowIso)
    .gte("ends_at", sinceIso)
    .is("replay_emailed_at", null)
    .in("status", ["scheduled", "completed"]);
  if (error) {
    // Missing column => migration not applied yet: no-op quietly.
    const code = (error as { code?: string }).code;
    if (code === "42703" || code === "PGRST204") return { skipped: true, events: 0, sent: 0 };
    console.error("[event-lifecycle] sendEventReplays query", error.message);
    return { events: 0, sent: 0 };
  }

  const rows = (data ?? []) as unknown as ReplayEventRow[];
  let events = 0;
  let sent = 0;

  for (const ev of rows) {
    if (ev.replay_hours_after === null || ev.replay_hours_after === undefined) continue; // disabled
    const replayUrl = ev.youtube_url || ev.recording_url;
    if (!replayUrl) continue; // no replay to send yet
    const endMs = Date.parse(ev.ends_at);
    if (!replayDue(endMs, ev.replay_hours_after, nowMs)) continue;

    const regs = await activeRegistrations(admin, ev.id);
    for (const r of regs) {
      const emailData: EventEmailData = {
        id: ev.id,
        title: ev.title,
        description: ev.description,
        startMs: Date.parse(ev.starts_at),
        endMs,
        joinUrl: ev.join_url,
        toEmail: r.userEmail,
        toName: r.userName,
        timezone: r.userTimezone || ev.timezone,
        imageUrl: ev.image_url,
      };
      const ok = await sendEventReplay(emailData, replayUrl, {
        subject: ev.replay_subject,
        body: ev.replay_body,
      });
      if (ok) sent += 1;
    }

    // Stamp once, whether or not there were registrants, so a zero-registrant
    // event is not rescanned every run.
    await admin
      .from("events")
      .update({ replay_emailed_at: new Date().toISOString() })
      .eq("id", ev.id);
    events += 1;
  }

  return { events, sent };
}
