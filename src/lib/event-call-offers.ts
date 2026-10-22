/**
 * Private 1:1 "event follow-up" calls: a handful of 45-minute slots offered
 * for one event, claimable only by that event's active registrants. Separate
 * from the public /dashboard/book flow (CALL_TYPES.event_followup is never
 * reachable from there - see src/app/api/booking/create/route.ts's own type
 * whitelist). An offer is held busy (via loadBusy()'s event_followup pad) from
 * the moment it's confirmed, whether or not anyone has claimed it yet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CALL_TYPES, suggestSlots, horizonDates, hasConflict, type Slot, type BusyRange } from "@/lib/scheduling";
import { getAdmin, loadBusy, loadRules, loadConfig } from "@/lib/scheduling-server";
import { getEvent, listSeriesEvents, registeredEventIdsForEmail } from "@/lib/events";
import { createMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { scheduleBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";
import { ownerNotifyEmail } from "@/lib/call-emails";
import { sendBookingConfirmation, sendOwnerNotification, type BookingEmailData } from "@/lib/call-emails";

export { getAdmin };

type Admin = SupabaseClient;

export type CallOffer = {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "claimed" | "cancelled";
  claimedBookingId: string | null;
  claimedEmail: string | null;
  claimedAt: string | null;
};

function toOffer(r: Record<string, unknown>): CallOffer {
  return {
    id: String(r.id),
    eventId: String(r.event_id),
    startsAt: (r.starts_at as string) ?? "",
    endsAt: (r.ends_at as string) ?? "",
    status: ((r.status as string) ?? "open") as CallOffer["status"],
    claimedBookingId: (r.claimed_booking_id as string | null) ?? null,
    claimedEmail: (r.claimed_email as string | null) ?? null,
    claimedAt: (r.claimed_at as string | null) ?? null,
  };
}

const OFFER_COLS = "id,event_id,starts_at,ends_at,status,claimed_booking_id,claimed_email,claimed_at";

/** The latest occurrence end-time across an event and its "pick one of
 *  several times" siblings (or just the event's own end if it has none). */
async function eventLatestEndMs(admin: Admin, eventId: string): Promise<number | null> {
  const event = await getEvent(admin, eventId);
  if (!event) return null;
  let latest = Date.parse(event.endsAt);
  if (event.seriesId) {
    const siblings = await listSeriesEvents(admin, event.seriesId);
    for (const s of siblings) {
      const end = Date.parse(s.endsAt);
      if (Number.isFinite(end) && end > latest) latest = end;
    }
  }
  return Number.isFinite(latest) ? latest : null;
}

/** Busy ranges from the (separate) events table, padded like an event_followup
 *  row - the one deliberate place events and calls are compared, scoped only
 *  to this suggestion function. */
async function loadEventBusyRanges(admin: Admin, fromMs: number, toMs: number, padMs: number): Promise<BusyRange[]> {
  const { data, error } = await admin
    .from("events")
    .select("starts_at,ends_at")
    .neq("status", "cancelled")
    .lt("starts_at", new Date(toMs).toISOString())
    .gt("ends_at", new Date(fromMs).toISOString());
  if (error || !data) return [];
  return data.map((r) => ({
    startMs: Date.parse(r.starts_at as string) - padMs,
    endMs: Date.parse(r.ends_at as string) + padMs,
  }));
}

/** Computes up to `count` candidate times. Writes nothing. */
export async function suggestEventFollowupSlots(
  admin: Admin,
  args: { eventId: string; count: number },
): Promise<{ ok: true; slots: Slot[] } | { ok: false; error: string }> {
  const latestEnd = await eventLatestEndMs(admin, args.eventId);
  if (latestEnd === null) return { ok: false, error: "Event not found." };

  const ct = CALL_TYPES.event_followup;
  const [rules, config] = await Promise.all([loadRules(admin), loadConfig(admin)]);
  if (rules.length === 0) return { ok: false, error: "No availability rules configured." };

  const nowMs = Date.now();
  const fromMs = Math.max(nowMs, latestEnd);
  const walkTz = rules[0].timezone;
  const dates = horizonDates(fromMs, config.bookingHorizonDays, walkTz);
  const toMs = fromMs + (config.bookingHorizonDays + 1) * 86_400_000;

  const [busy, eventBusy] = await Promise.all([
    loadBusy(admin, fromMs, toMs, { googleRefreshToken: config.googleRefreshToken, callType: "event_followup" }),
    loadEventBusyRanges(admin, fromMs, toMs, ct.busyPadMinutes * 60_000),
  ]);

  const slots = suggestSlots({
    dates,
    rules,
    busy: [...busy, ...eventBusy],
    // The floor is "after this event" (fromMs), not just "now" - horizonDates
    // starts at fromMs's own calendar day, so without this, suggestSlots's
    // lead-time check (which only compares against its nowMs) would happily
    // offer times earlier the same day, before the event even starts.
    nowMs: fromMs,
    leadHours: config.leadTimeHours,
    durationMinutes: ct.userMinutes,
    padMinutes: ct.busyPadMinutes,
    count: Math.max(1, Math.min(args.count, 20)),
  });
  return { ok: true, slots };
}

/** Re-validates and holds each still-available slot as an open offer. */
export async function confirmEventFollowupSlots(
  admin: Admin,
  args: { eventId: string; slots: { startMs: number; endMs: number }[] },
): Promise<{ created: CallOffer[]; skipped: { startMs: number; endMs: number }[] }> {
  const ct = CALL_TYPES.event_followup;
  const created: CallOffer[] = [];
  const skipped: { startMs: number; endMs: number }[] = [];
  const config = await loadConfig(admin);

  for (const slot of args.slots) {
    const padMs = ct.busyPadMinutes * 60_000;
    const fromMs = slot.startMs - padMs - 60_000;
    const toMs = slot.endMs + padMs + 60_000;
    const [busy, eventBusy] = await Promise.all([
      loadBusy(admin, fromMs, toMs, { googleRefreshToken: config.googleRefreshToken, callType: "event_followup" }),
      loadEventBusyRanges(admin, fromMs, toMs, padMs),
    ]);
    // busy/eventBusy are already padded (loadBusy pads per-row for an
    // event_followup requester; loadEventBusyRanges pads events rows the same
    // way) - check the plain candidate range against them, not padded again.
    const stillOpen = !hasConflict(slot.startMs, slot.endMs, [...busy, ...eventBusy]);
    if (!stillOpen) {
      skipped.push(slot);
      continue;
    }
    const { data, error } = await admin
      .from("event_call_offers")
      .insert({
        event_id: args.eventId,
        starts_at: new Date(slot.startMs).toISOString(),
        ends_at: new Date(slot.endMs).toISOString(),
        status: "open",
      })
      .select(OFFER_COLS)
      .maybeSingle();
    if (error || !data) {
      console.error("[event-call-offers] confirm insert", error?.message);
      skipped.push(slot);
      continue;
    }
    created.push(toOffer(data));
  }
  return { created, skipped };
}

export async function listEventCallOffers(admin: Admin, eventId: string): Promise<CallOffer[]> {
  const { data, error } = await admin
    .from("event_call_offers")
    .select(OFFER_COLS)
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("[event-call-offers] list", error.message);
    return [];
  }
  return (data ?? []).map(toOffer);
}

/** Open offers for an event the given email is an active registrant of. */
export async function listOpenOffersForRegistrant(
  admin: Admin,
  eventId: string,
  email: string,
): Promise<{ ok: true; offers: CallOffer[] } | { ok: false; error: string }> {
  const registeredIds = await registeredEventIdsForEmail(admin, email);
  if (!registeredIds.has(eventId)) {
    return { ok: false, error: "You need to be registered for this event to book a follow-up call." };
  }
  const all = await listEventCallOffers(admin, eventId);
  return { ok: true, offers: all.filter((o) => o.status === "open" && Date.parse(o.endsAt) > Date.now()) };
}

/** Cancels an unclaimed offer, freeing the time immediately. */
export async function cancelEventCallOffer(admin: Admin, offerId: string): Promise<boolean> {
  const { error } = await admin
    .from("event_call_offers")
    .update({ status: "cancelled" })
    .eq("id", offerId)
    .eq("status", "open");
  if (error) console.error("[event-call-offers] cancel", error.message);
  return !error;
}

/**
 * Atomically claims an offer (optimistic compare-and-swap on status='open'),
 * then books it as a real call_bookings row - Meet link, Recall bot,
 * confirmation email, same as a normal booking from here on.
 */
export async function claimEventCallOffer(
  admin: Admin,
  args: { offerId: string; eventId: string; userId: string; userEmail: string; userName: string | null; userTimezone: string | null },
): Promise<{ ok: true; bookingId: string; joinUrl: string | null } | { ok: false; error: string; status: number }> {
  const eligible = await registeredEventIdsForEmail(admin, args.userEmail);
  if (!eligible.has(args.eventId)) {
    return { ok: false, error: "You need to be registered for this event to book a follow-up call.", status: 403 };
  }

  const { data: claimed, error: claimErr } = await admin
    .from("event_call_offers")
    .update({ status: "claimed", claimed_email: args.userEmail, claimed_at: new Date().toISOString() })
    .eq("id", args.offerId)
    .eq("event_id", args.eventId)
    .eq("status", "open")
    .select(OFFER_COLS)
    .maybeSingle();
  if (claimErr) {
    console.error("[event-call-offers] claim", claimErr.message);
    return { ok: false, error: "Could not book that time.", status: 500 };
  }
  if (!claimed) {
    return { ok: false, error: "That time was just taken. Please pick another.", status: 409 };
  }
  const offer = toOffer(claimed);
  const startMs = Date.parse(offer.startsAt);
  const endMs = Date.parse(offer.endsAt);

  const config = await loadConfig(admin);
  const event = await getEvent(admin, args.eventId);
  let joinUrl: string | null = null;
  let provider: string | null = null;
  let meetingId: string | null = null;
  if (isGoogleConfigured() && config.googleRefreshToken) {
    const m = await createMeetEvent({
      refreshToken: config.googleRefreshToken,
      summary: `Follow-up call: ${event?.title ?? "Influencer Butler event"}`,
      startMs,
      endMs,
      attendeeEmail: args.userEmail,
    });
    if (m) { joinUrl = m.joinUrl; provider = "google_meet"; meetingId = m.meetingId; }
  }
  if (!joinUrl && config.defaultJoinUrl) { joinUrl = config.defaultJoinUrl; provider = "manual"; }

  const { data: inserted, error: insertErr } = await admin
    .from("call_bookings")
    .insert({
      user_id: args.userId,
      user_email: args.userEmail,
      user_name: args.userName,
      call_type: "event_followup",
      starts_at: offer.startsAt,
      ends_at: offer.endsAt,
      user_ends_at: offer.endsAt,
      user_timezone: args.userTimezone,
      topic: event ? `Follow-up for: ${event.title}` : null,
      join_url: joinUrl,
      meeting_provider: provider,
      meeting_id: meetingId,
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !inserted?.id) {
    console.error("[event-call-offers] booking insert", insertErr?.message);
    // Best-effort: hand the offer back rather than leave it stuck claimed with no booking.
    await admin.from("event_call_offers").update({ status: "open", claimed_email: null, claimed_at: null }).eq("id", args.offerId);
    return { ok: false, error: "Could not book that time.", status: 500 };
  }
  const bookingId = String(inserted.id);
  await admin.from("event_call_offers").update({ claimed_booking_id: bookingId }).eq("id", args.offerId);

  let recordingStatus = "none";
  let recallBotId: string | null = null;
  if (!shouldScheduleRecordingBot(provider, joinUrl)) {
    recordingStatus = "skipped_no_meet";
  } else if (isRecallConfigured()) {
    const bot = await scheduleBot({
      meetingUrl: joinUrl as string,
      joinAtISO: new Date(startMs).toISOString(),
      botName: "Influencer Butler Notetaker",
      metadata: { bookingId },
    });
    if (bot) { recallBotId = bot.id; recordingStatus = "scheduled"; }
    else recordingStatus = "failed";
  }
  if (recordingStatus !== "none") {
    try {
      await admin.from("call_bookings").update({ recall_bot_id: recallBotId, recording_status: recordingStatus }).eq("id", bookingId);
    } catch (e) { console.error("[event-call-offers] recording status update", e); }
  }

  const emailData: BookingEmailData = {
    id: bookingId,
    callType: "event_followup",
    userEmail: args.userEmail,
    userName: args.userName,
    startMs,
    userEndMs: endMs,
    userTimezone: args.userTimezone,
    topic: event ? `Follow-up for: ${event.title}` : null,
    joinUrl,
    recorded: recordingStatus === "scheduled",
  };
  try { await sendBookingConfirmation(emailData); } catch (e) { console.error("[event-call-offers] confirm email", e); }
  try {
    if (ownerNotifyEmail()) await sendOwnerNotification(emailData, `Follow-up call for event: ${event?.title ?? args.eventId}.`);
  } catch (e) { console.error("[event-call-offers] owner email", e); }

  return { ok: true, bookingId, joinUrl };
}

/** Any still-open, not-yet-past offers for this event? Used to decide whether
 *  the replay email should include a "book a follow-up call" link. */
export async function hasOpenOffers(admin: Admin, eventId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("event_call_offers")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "open")
    .gt("ends_at", new Date().toISOString())
    .limit(1);
  if (error) {
    console.error("[event-call-offers] hasOpenOffers", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
