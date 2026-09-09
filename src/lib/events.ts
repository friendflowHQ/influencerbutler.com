/**
 * Events data layer: scheduled group calls with RSVP, cross-app banners, and an
 * AI recap. All access is server-side with the service-role key (the `events`
 * and `event_registrations` tables are RLS deny-all), mirroring
 * scheduling-server.ts's getAdmin() pattern.
 *
 * If migration 20260909_events.sql has not been applied to prod yet, reads
 * return empty and writes fail loudly (the route reports an error), so the
 * feature stays inert rather than crashing.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiNotes } from "@/lib/ai-notes";

export type EventStatus = "draft" | "scheduled" | "cancelled" | "completed";
export type BannerSurface = "web" | "extension" | "desktop";

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: EventStatus;
  joinUrl: string | null;
  meetingProvider: string | null;
  meetingId: string | null;
  bannerEnabled: boolean;
  bannerText: string | null;
  bannerCtaLabel: string | null;
  bannerStartsAt: string | null;
  bannerEndsAt: string | null;
  bannerSurfaces: BannerSurface[];
  recordEnabled: boolean;
  recallBotId: string | null;
  recordingStatus: string;
  recordingUrl: string | null;
  aiNotes: AiNotes | null;
  recordedAt: string | null;
  highlightsEmailedAt: string | null;
  createdAt: string;
  cancelledAt: string | null;
};

export type EventRegistration = {
  id: string;
  eventId: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  userTimezone: string | null;
  registeredAt: string;
  cancelledAt: string | null;
};

export type ActiveBanner = {
  id: string;
  text: string;
  ctaLabel: string | null;
  ctaUrl: string;
  startsAt: string;
  endsAt: string | null;
};

type Admin = SupabaseClient;

export function getAdmin(): Admin | null {
  try {
    return createAdminClient();
  } catch (e) {
    console.error("[events] admin client", e);
    return null;
  }
}

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

const EVENT_COLS =
  "id,title,description,starts_at,ends_at,timezone,status,join_url,meeting_provider,meeting_id," +
  "banner_enabled,banner_text,banner_cta_label,banner_starts_at,banner_ends_at,banner_surfaces," +
  "record_enabled,recall_bot_id,recording_status,recording_url,ai_notes,recorded_at,highlights_emailed_at," +
  "created_at,cancelled_at";

function toEvent(r: Record<string, unknown>): EventRow {
  const surfaces = Array.isArray(r.banner_surfaces)
    ? (r.banner_surfaces as string[]).filter(
        (s): s is BannerSurface => s === "web" || s === "extension" || s === "desktop",
      )
    : [];
  return {
    id: String(r.id),
    title: (r.title as string) ?? "",
    description: (r.description as string | null) ?? null,
    startsAt: (r.starts_at as string) ?? "",
    endsAt: (r.ends_at as string) ?? "",
    timezone: (r.timezone as string) ?? "America/Denver",
    status: ((r.status as string) ?? "scheduled") as EventStatus,
    joinUrl: (r.join_url as string | null) ?? null,
    meetingProvider: (r.meeting_provider as string | null) ?? null,
    meetingId: (r.meeting_id as string | null) ?? null,
    bannerEnabled: r.banner_enabled === true,
    bannerText: (r.banner_text as string | null) ?? null,
    bannerCtaLabel: (r.banner_cta_label as string | null) ?? null,
    bannerStartsAt: (r.banner_starts_at as string | null) ?? null,
    bannerEndsAt: (r.banner_ends_at as string | null) ?? null,
    bannerSurfaces: surfaces,
    recordEnabled: r.record_enabled === true,
    recallBotId: (r.recall_bot_id as string | null) ?? null,
    recordingStatus: (r.recording_status as string) ?? "none",
    recordingUrl: (r.recording_url as string | null) ?? null,
    aiNotes: (r.ai_notes as AiNotes | null) ?? null,
    recordedAt: (r.recorded_at as string | null) ?? null,
    highlightsEmailedAt: (r.highlights_emailed_at as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    cancelledAt: (r.cancelled_at as string | null) ?? null,
  };
}

// ── Admin reads ──────────────────────────────────────────────────────────

export async function listEvents(admin: Admin, limit = 100): Promise<EventRow[]> {
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLS)
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[events] listEvents", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEvent);
}

export async function getEvent(admin: Admin, id: string): Promise<EventRow | null> {
  const { data, error } = await admin.from("events").select(EVENT_COLS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toEvent(data as unknown as Record<string, unknown>);
}

/** Upcoming, non-cancelled events for the customer-facing list. */
export async function listUpcomingEvents(admin: Admin, limit = 50): Promise<EventRow[]> {
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLS)
    .eq("status", "scheduled")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[events] listUpcomingEvents", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEvent);
}

// ── Registrations ──────────────────────────────────────────────────────────

export async function listRegistrations(
  admin: Admin,
  eventId: string,
): Promise<EventRegistration[]> {
  const { data, error } = await admin
    .from("event_registrations")
    .select("id,event_id,user_id,user_email,user_name,user_timezone,registered_at,cancelled_at")
    .eq("event_id", eventId)
    .order("registered_at", { ascending: true });
  if (error) {
    console.error("[events] listRegistrations", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    userId: (r.user_id as string | null) ?? null,
    userEmail: (r.user_email as string) ?? "",
    userName: (r.user_name as string | null) ?? null,
    userTimezone: (r.user_timezone as string | null) ?? null,
    registeredAt: (r.registered_at as string) ?? "",
    cancelledAt: (r.cancelled_at as string | null) ?? null,
  }));
}

/** Active (non-cancelled) registrations for an event, used by reminders + recap. */
export async function activeRegistrations(
  admin: Admin,
  eventId: string,
): Promise<EventRegistration[]> {
  return (await listRegistrations(admin, eventId)).filter((r) => !r.cancelledAt);
}

/** Count of active registrations, keyed by event id, for the admin list. */
export async function registrationCounts(
  admin: Admin,
  eventIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (eventIds.length === 0) return counts;
  const { data, error } = await admin
    .from("event_registrations")
    .select("event_id,cancelled_at")
    .in("event_id", eventIds);
  if (error || !data) return counts;
  for (const r of data) {
    if ((r as { cancelled_at: string | null }).cancelled_at) continue;
    const id = String((r as { event_id: string }).event_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** The event ids the given email is actively registered for. */
export async function registeredEventIdsForEmail(
  admin: Admin,
  email: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("event_registrations")
    .select("event_id,cancelled_at")
    .eq("user_email", email);
  const set = new Set<string>();
  if (error || !data) return set;
  for (const r of data) {
    if ((r as { cancelled_at: string | null }).cancelled_at) continue;
    set.add(String((r as { event_id: string }).event_id));
  }
  return set;
}

// ── Banner feed (shared by web / extension / desktop) ──────────────────────

/**
 * Events whose banner is currently active for `surface`: banner enabled, the
 * event not cancelled, now inside the banner window (an unset start/end means
 * open-ended), and the surface targeted. Falls back to the event window when no
 * explicit banner window is set. Ordered soonest-event first.
 */
export async function activeBanners(
  admin: Admin,
  surface: BannerSurface,
  nowMs = Date.now(),
): Promise<ActiveBanner[]> {
  const { data, error } = await admin
    .from("events")
    .select(
      "id,title,starts_at,ends_at,banner_enabled,banner_text,banner_cta_label,banner_starts_at,banner_ends_at,banner_surfaces,status",
    )
    .eq("banner_enabled", true)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("[events] activeBanners", error.message);
    return [];
  }

  const out: ActiveBanner[] = [];
  for (const raw of data) {
    const r = raw as Record<string, unknown>;
    const surfaces = Array.isArray(r.banner_surfaces) ? (r.banner_surfaces as string[]) : [];
    if (!surfaces.includes(surface)) continue;
    const text = ((r.banner_text as string | null) ?? "").trim();
    if (!text) continue;

    // Banner window: explicit banner_starts_at/ends_at, else the event window.
    const startIso = (r.banner_starts_at as string | null) ?? null;
    const endIso = (r.banner_ends_at as string | null) ?? (r.ends_at as string | null) ?? null;
    const startMs = startIso ? Date.parse(startIso) : null;
    const endMs = endIso ? Date.parse(endIso) : null;
    if (startMs !== null && Number.isFinite(startMs) && nowMs < startMs) continue;
    if (endMs !== null && Number.isFinite(endMs) && nowMs > endMs) continue;

    out.push({
      id: String(r.id),
      text,
      ctaLabel: (r.banner_cta_label as string | null) ?? null,
      ctaUrl: `${SITE}/dashboard/events`,
      startsAt: (r.starts_at as string) ?? "",
      endsAt: (r.ends_at as string | null) ?? null,
    });
  }
  return out;
}
