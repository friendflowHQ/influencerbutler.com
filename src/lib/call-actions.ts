/**
 * Server-side booking mutations shared by the owner console and the customer
 * (emailed manage link / dashboard). Callers do their own authorization and
 * slot validation; these functions carry out the change and everything tied to
 * the old state: the Google Meet event, the recording bot, the reminder stamps
 * and the emails.
 */
import { getAdmin, loadConfig } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { sendCancellation, sendOwnerChange, sendRescheduled, type BookingEmailData } from "@/lib/call-emails";
import { createMeetEvent, deleteMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { stopBot, scheduleBot, isRecallConfigured, shouldScheduleRecordingBot } from "@/lib/recall";

type Admin = NonNullable<ReturnType<typeof getAdmin>>;

export type BookingRow = {
  id: string; user_email: string; user_name: string | null; call_type: CallTypeKey;
  starts_at: string; user_ends_at: string; user_timezone: string | null; topic: string | null; status: string;
  join_url: string | null; meeting_provider: string | null; meeting_id: string | null;
  recall_bot_id: string | null; recording_status: string | null;
};

export const BOOKING_ROW_COLS =
  "id,user_email,user_name,call_type,starts_at,user_ends_at,user_timezone,topic,status,join_url,meeting_provider,meeting_id,recall_bot_id,recording_status";

function emailData(b: BookingRow, over?: Partial<BookingEmailData>): BookingEmailData {
  return {
    id: b.id, callType: b.call_type, userEmail: b.user_email, userName: b.user_name,
    startMs: Date.parse(b.starts_at), userEndMs: Date.parse(b.user_ends_at),
    userTimezone: b.user_timezone, topic: b.topic, joinUrl: b.join_url, ...over,
  };
}

export type MoveResult =
  | { ok: true; emailSent: boolean; joinUrl: string | null; warnings: string[]; startMs: number; userEndMs: number }
  | { ok: false; status: number; error: string };

/**
 * Moves a booking to `startMs` and carries everything tied to the old time with
 * it. The caller has already checked that the new time is allowed.
 */
export async function moveBooking(
  admin: Admin,
  booking: BookingRow,
  startMs: number,
  opts: { sendEmail: boolean; notifyOwner?: boolean },
): Promise<MoveResult> {
  const ct = CALL_TYPES[booking.call_type];
  const oldStartMs = Date.parse(booking.starts_at);
  const endMs = startMs + ct.blockMinutes * 60_000;
  const userEndMs = startMs + ct.userMinutes * 60_000;

  const warnings: string[] = [];
  const cfg = await loadConfig(admin);
  let joinUrl = booking.join_url;
  let meetingId = booking.meeting_id;

  // A Meet event we created is tied to the old time: make a new one at the new
  // time, then drop the old. If creating fails we keep the old room (its link
  // still works) and say so, rather than leave the booking with no link.
  if (booking.meeting_provider === "google_meet" && meetingId && cfg.googleRefreshToken && isGoogleConfigured()) {
    const m = await createMeetEvent({
      refreshToken: cfg.googleRefreshToken,
      summary: `${ct.label} with Influencer Butler`,
      description: booking.topic || undefined,
      startMs,
      endMs: userEndMs,
      attendeeEmail: booking.user_email,
    });
    if (m) {
      try { await deleteMeetEvent(cfg.googleRefreshToken, meetingId); } catch (e) { console.error("[call-actions] old meet delete", e); }
      joinUrl = m.joinUrl; meetingId = m.meetingId;
    } else warnings.push("Could not move the Google Calendar event, so the original Meet link was kept. Check your calendar.");
  }

  // The bot was scheduled for the old time/room: stop it and send a new one.
  let recallBotId = booking.recall_bot_id;
  let recordingStatus = booking.recording_status;
  if (booking.recall_bot_id || booking.recording_status === "scheduled") {
    if (booking.recall_bot_id) { try { await stopBot(booking.recall_bot_id); } catch (e) { console.error("[call-actions] stop bot", e); } }
    recallBotId = null;
    if (!shouldScheduleRecordingBot(booking.meeting_provider, joinUrl)) recordingStatus = "skipped_no_meet";
    else if (isRecallConfigured()) {
      try {
        const bot = await scheduleBot({ meetingUrl: joinUrl as string, joinAtISO: new Date(startMs).toISOString(), botName: "Influencer Butler Notetaker", metadata: { bookingId: booking.id } });
        if (bot) { recallBotId = bot.id; recordingStatus = "scheduled"; } else { recordingStatus = "failed"; warnings.push("The recording bot could not be re-scheduled. Use Send recorder now before the call."); }
      } catch (e) { console.error("[call-actions] schedule bot", e); recordingStatus = "failed"; }
    }
  }

  const patch = {
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(endMs).toISOString(),
    user_ends_at: new Date(userEndMs).toISOString(),
    status: "confirmed",
    join_url: joinUrl,
    meeting_id: meetingId,
    recall_bot_id: recallBotId,
    recording_status: recordingStatus,
    // The reminders were stamped for the old time; clear them so they fire for the new one.
    reminded_24h_at: null,
    reminded_1h_at: null,
  };
  const { error: updErr } = await admin.from("call_bookings").update(patch).eq("id", booking.id);
  if (updErr) { console.error("[call-actions] reschedule", updErr.message); return { ok: false, status: 500, error: "Update failed" }; }

  let emailSent = false;
  const moved = emailData(booking, { startMs, userEndMs, joinUrl });
  if (opts.sendEmail) {
    try { emailSent = await sendRescheduled(moved, oldStartMs); } catch (e) { console.error("[call-actions] reschedule email", e); }
  }
  if (opts.notifyOwner) {
    try { await sendOwnerChange(moved, "rescheduled", `Moved from ${new Date(oldStartMs).toISOString()} (UTC).`); } catch (e) { console.error("[call-actions] owner notify", e); }
  }
  return { ok: true, emailSent, joinUrl, warnings, startMs, userEndMs };
}

export type CancelResult = { ok: true; alreadyCancelled: boolean; emailSent: boolean } | { ok: false; status: number; error: string };

/**
 * Cancels a confirmed booking: flips the status (guarded so a double click or a
 * second email link cannot cancel twice), emails the customer a cancellation
 * (+.ics), removes the Meet event and stops the recording bot so it never joins
 * a cancelled call.
 */
export async function cancelBooking(
  admin: Admin,
  booking: BookingRow,
  opts: { reason?: string; notifyOwner?: boolean },
): Promise<CancelResult> {
  const { data: updated, error: updErr } = await admin
    .from("call_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: (opts.reason || "").slice(0, 500), recording_status: "none" })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id");
  if (updErr) { console.error("[call-actions] cancel", updErr.message); return { ok: false, status: 500, error: "Could not cancel" }; }
  if (!updated || updated.length === 0) return { ok: true, alreadyCancelled: true, emailSent: false };

  let emailSent = false;
  try { emailSent = await sendCancellation(emailData(booking)); } catch (e) { console.error("[call-actions] cancel email", e); }

  if (booking.meeting_provider === "google_meet" && booking.meeting_id) {
    try { const cfg = await loadConfig(admin); if (cfg.googleRefreshToken) await deleteMeetEvent(cfg.googleRefreshToken, booking.meeting_id); }
    catch (e) { console.error("[call-actions] meet delete", e); }
  }
  if (booking.recall_bot_id) {
    try { await stopBot(booking.recall_bot_id); } catch (e) { console.error("[call-actions] stop bot", e); }
  }
  if (opts.notifyOwner) {
    try { await sendOwnerChange(emailData(booking), "cancelled", opts.reason ? `Reason: ${opts.reason.slice(0, 500)}` : "No reason given."); } catch (e) { console.error("[call-actions] owner notify", e); }
  }
  return { ok: true, alreadyCancelled: false, emailSent };
}
