/**
 * Finalize step for a recorded group event. Both the Recall webhook
 * (src/app/api/booking/recall-webhook) and the fallback cron
 * (src/app/api/cron/process-recordings) route here once a transcript is ready
 * for an event bot (bot metadata carries eventId, vs bookingId for 1:1 calls).
 *
 * It summarizes the transcript into review notes, writes them onto the event
 * row, and (once) emails every active registrant an AI recap. Recap emailing is
 * idempotent via events.highlights_emailed_at: whichever path finalizes first
 * emails the recap and stamps the time; the other sees the stamp and skips.
 * Emailing is best-effort and never throws out of here, so a Resend outage can
 * never fail a recording finalize.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeTranscript } from "@/lib/ai-notes";
import { sendEventRecap, type EventEmailData } from "@/lib/event-emails";
import { activeRegistrations } from "@/lib/events";

export type FinalizeEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  join_url: string | null;
  highlights_emailed_at: string | null;
};

export async function applyEventTranscriptResult(
  admin: SupabaseClient,
  event: FinalizeEvent,
  result: { transcript: string; recordingUrl: string | null },
): Promise<void> {
  const notes = await summarizeTranscript(result.transcript, {
    callType: "group event",
    topic: event.title,
  });

  const update: Record<string, unknown> = {
    recording_status: "ready",
    recording_url: result.recordingUrl,
    transcript: result.transcript,
    ai_notes: notes,
    recorded_at: new Date().toISOString(),
  };

  // Email the recap to every active registrant, exactly once per event. Guarded
  // so the webhook and cron never double-send. Any failure is swallowed: notes
  // still get written, and the row is stamped so we do not retry a partial send.
  if (!event.highlights_emailed_at && notes) {
    try {
      await emailRecapToRegistrants(admin, event, notes, result.recordingUrl);
    } catch (e) {
      console.error("[event-finalize] recap email", event.id, e);
    }
    // Stamp regardless (success or a partial send) so we never re-blast the list.
    update.highlights_emailed_at = new Date().toISOString();
  }

  await admin.from("events").update(update).eq("id", event.id);
}

async function emailRecapToRegistrants(
  admin: SupabaseClient,
  event: FinalizeEvent,
  notes: NonNullable<Awaited<ReturnType<typeof summarizeTranscript>>>,
  recordingUrl: string | null,
): Promise<void> {
  const regs = await activeRegistrations(admin, event.id);
  const startMs = Date.parse(event.starts_at);
  const endMs = Date.parse(event.ends_at);
  for (const r of regs) {
    const data: EventEmailData = {
      id: event.id,
      title: event.title,
      description: event.description,
      startMs,
      endMs,
      joinUrl: event.join_url,
      toEmail: r.userEmail,
      toName: r.userName,
      timezone: r.userTimezone || event.timezone,
    };
    try {
      await sendEventRecap(data, notes, recordingUrl);
    } catch (e) {
      console.error("[event-finalize] recap to", r.userEmail, e);
    }
  }
}
