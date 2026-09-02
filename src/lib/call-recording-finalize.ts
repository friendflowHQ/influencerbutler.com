/**
 * Shared finalize step for a recorded call. Both the Recall webhook
 * (src/app/api/booking/recall-webhook) and the hourly backstop cron
 * (src/app/api/cron/process-recordings) reach the same end state once a
 * transcript is ready: summarize it into review notes AND auto-file any support
 * tickets the call surfaced. Keeping that in one place stops the two paths from
 * drifting apart.
 *
 * Auto-filing is idempotent via call_bookings.tickets_filed_at: whichever path
 * finalizes first files the tickets and stamps the time; the other sees the
 * stamp and skips. Ticket filing is best-effort and never throws out of here, so
 * a worker outage can never fail a recording finalize.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeTranscript, type AiNotes } from "@/lib/ai-notes";
import { extractSupportItems, isCallTicketsConfigured } from "@/lib/call-tickets";
import { submitSupportTicket } from "@/lib/support-worker";

export type FinalizeBooking = {
  id: string;
  call_type: string;
  topic: string | null;
  user_email: string | null;
  tickets_filed_at: string | null;
};

/**
 * Given a ready transcript for a booking, write the review notes + recording URL
 * onto the row and (once) auto-file support tickets for issues/feature requests
 * raised on the call. Sets recording_status to 'ready'.
 */
export async function applyTranscriptResult(
  admin: SupabaseClient,
  booking: FinalizeBooking,
  result: { transcript: string; recordingUrl: string | null },
): Promise<void> {
  const notes = await summarizeTranscript(result.transcript, {
    callType: booking.call_type,
    topic: booking.topic,
  });

  const update: Record<string, unknown> = {
    recording_status: "ready",
    recording_url: result.recordingUrl,
    transcript: result.transcript,
    ai_notes: notes,
    recorded_at: new Date().toISOString(),
  };

  // Auto-file support tickets, exactly once per booking. Guarded so the webhook
  // and the cron never double-file. Any failure here is swallowed: notes still
  // get written, and the row is stamped so we do not retry a partial file.
  if (!booking.tickets_filed_at) {
    try {
      const filedIds = await fileTicketsFromCall(booking, result.transcript, notes);
      update.filed_ticket_ids = filedIds;
      update.tickets_filed_at = new Date().toISOString();
    } catch (e) {
      console.error("[finalize] auto-file tickets", booking.id, e);
      // Stamp anyway so we do not re-run extraction on the next finalize pass.
      update.tickets_filed_at = new Date().toISOString();
    }
  }

  await admin.from("call_bookings").update(update).eq("id", booking.id);
}

/**
 * Extract issues/feature requests from the transcript and file each as a support
 * ticket. Returns the created ticket ids (fb-...). Returns [] when the extractor
 * is unconfigured or finds nothing.
 *
 * Note on the reply address: we intentionally file under the OWNER support inbox
 * (SCHEDULING_OWNER_EMAIL / first ADMIN_EMAILS), NOT the customer's address, so
 * the feedback worker's automatic "we got your report" acknowledgement does not
 * surprise a customer who never opened a ticket. The customer's email is recorded
 * in the ticket description for reference and reply.
 */
async function fileTicketsFromCall(
  booking: FinalizeBooking,
  transcript: string,
  notes: AiNotes | null,
): Promise<string[]> {
  if (!isCallTicketsConfigured()) return [];
  const items = await extractSupportItems(transcript, {
    callType: booking.call_type,
    topic: booking.topic,
    summary: notes?.summary ?? null,
  });
  if (items.length === 0) return [];

  const filedOwner = ownerSupportEmail();
  const provenance =
    `\n\n[Auto-filed from a booked ${booking.call_type} call on ${new Date().toISOString().slice(0, 10)}` +
    (booking.user_email ? `. Customer: ${booking.user_email}` : "") +
    `. Booking ${booking.id}.]`;

  const ids: string[] = [];
  for (const item of items) {
    const { ok, id } = await submitSupportTicket({
      type: item.type,
      title: item.title,
      description: `${item.description}${provenance}`,
      userEmail: filedOwner || undefined,
      platform: "call-notes",
      tags: "from-call",
    });
    if (ok && id) ids.push(id);
  }
  return ids;
}

/** Owner/support inbox tickets are filed under. Mirrors call-emails ownerNotifyEmail. */
function ownerSupportEmail(): string | null {
  const explicit = process.env.SCHEDULING_OWNER_EMAIL?.trim();
  if (explicit) return explicit;
  const first = (process.env.ADMIN_EMAILS || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first || null;
}
