/**
 * Auto-file support tickets from a finished AI Concierge session (voice or
 * text), the same idea as call-recording-finalize.ts for recorded calls: an LLM
 * extracts concrete bugs the customer hit or explicit feature requests and files
 * each into the support queue. Runs from /api/ai-concierge/transcript once the
 * final transcript + summary are saved.
 *
 * Idempotent via ai_concierge_sessions.tickets_filed_at: the text bubble can save
 * the same session more than once (an insert, then later updates on pagehide),
 * and this must never double-file. Best-effort and never throws out of here, so a
 * worker outage can never fail the transcript save.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiNotes } from "@/lib/ai-notes";
import { extractSupportItems, isCallTicketsConfigured } from "@/lib/call-tickets";
import { ownerSupportEmail } from "@/lib/call-recording-finalize";
import { submitSupportTicket } from "@/lib/support-worker";

export type ConciergeSessionRow = {
  id: string;
  mode: string;
  user_email: string | null;
  tickets_filed_at: string | null;
};

/**
 * File tickets for one concierge session, exactly once. No-op if already filed.
 * Any failure is swallowed (and logged); the row is stamped regardless so a
 * later save of the same session never re-runs extraction.
 */
export async function fileTicketsFromConciergeSession(
  admin: SupabaseClient,
  session: ConciergeSessionRow,
  transcript: string,
  summary: AiNotes | null,
): Promise<void> {
  if (session.tickets_filed_at) return;

  let filedIds: string[] = [];
  try {
    filedIds = await fileTickets(session, transcript, summary);
  } catch (e) {
    console.error("[concierge-tickets] auto-file", session.id, e);
  }

  const { error } = await admin
    .from("ai_concierge_sessions")
    .update({ tickets_filed_at: new Date().toISOString(), filed_ticket_ids: filedIds })
    .eq("id", session.id);
  if (error) console.error("[concierge-tickets] stamp", session.id, error.message);
}

/**
 * Extract issues/feature requests from the transcript and file each as a support
 * ticket. Returns the created ticket ids (fb-...). Returns [] when the extractor
 * is unconfigured or finds nothing.
 *
 * Filed under the OWNER support inbox (not the customer's address), same reason
 * as call-recording-finalize: the feedback worker's auto-acknowledgement should
 * not surprise a customer who never opened a ticket themselves. The customer's
 * email is recorded in the ticket description for reference and reply.
 */
async function fileTickets(session: ConciergeSessionRow, transcript: string, summary: AiNotes | null): Promise<string[]> {
  if (!isCallTicketsConfigured()) return [];
  const items = await extractSupportItems(transcript, {
    callType: `ai-concierge-${session.mode}`,
    summary: summary?.summary ?? null,
    kind: "concierge",
  });
  if (items.length === 0) return [];

  const provenance =
    `\n\n[Auto-filed from an AI Concierge ${session.mode} session on ${new Date().toISOString().slice(0, 10)}` +
    (session.user_email ? `. Customer: ${session.user_email}` : "") +
    `. Session ${session.id}.]`;

  const filedOwner = ownerSupportEmail();
  const ids: string[] = [];
  for (const item of items) {
    const { ok, id } = await submitSupportTicket({
      type: item.type,
      title: item.title,
      description: `${item.description}${provenance}`,
      userEmail: filedOwner || undefined,
      platform: "ai-concierge",
      tags: "from-concierge",
    });
    if (ok && id) ids.push(id);
  }
  return ids;
}
