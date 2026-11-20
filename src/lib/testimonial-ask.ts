/**
 * Shared rules for WHEN we may ask a subscriber for a testimonial, used by both
 * the day-45 email cron and the in-app banner API so the two never disagree.
 *
 * Rules:
 *  - Lifetime cap: at most MAX_ASKS asks per user (email + banner appearances).
 *  - Cooldown: no new ask within COOLDOWN_DAYS of the previous one.
 *  - Support: no ask while the user has an open support ticket (they are
 *    probably frustrated, and a review prompt on top of a bug report is tone-deaf).
 *
 * The count and last-asked time live in subscriptions.testimonial_ask_count and
 * testimonial_last_asked_at (migration 20261122_testimonial_ask_state.sql). Prod
 * migrations are applied by hand, so every read/write here tolerates the columns
 * being missing: the state then reads as "never asked" and writes are skipped.
 */
import { callSupportWorker, isSupportWorkerConfigured } from "@/lib/support-worker";

export const MAX_ASKS = 3;
export const COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Ticket statuses that mean the customer still has something open with us. */
export const OPEN_TICKET_STATUSES = [
  "sent",
  "acked",
  "clarifying",
  "waiting_on_user",
  "user_replied",
  "patching",
  "committed",
  "escalated",
];

type StateClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
  };
};

export type AskState = { count: number; lastAskedAt: number | null; known: boolean };

/** Read the ask counters. `known` is false when the columns are not migrated yet. */
export async function readAskState(client: unknown, userId: string): Promise<AskState> {
  try {
    const { data, error } = await (client as StateClient)
      .from("subscriptions")
      .select("testimonial_ask_count,testimonial_last_asked_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { count: 0, lastAskedAt: null, known: false };
    const count = typeof data.testimonial_ask_count === "number" ? data.testimonial_ask_count : 0;
    const last =
      typeof data.testimonial_last_asked_at === "string"
        ? new Date(data.testimonial_last_asked_at).getTime()
        : null;
    return { count, lastAskedAt: Number.isFinite(last) ? last : null, known: true };
  } catch {
    return { count: 0, lastAskedAt: null, known: false };
  }
}

/** True when another ask is allowed under the lifetime cap and the cooldown. */
export function askAllowed(state: AskState, now = Date.now()): boolean {
  if (state.count >= MAX_ASKS) return false;
  if (state.lastAskedAt !== null && now - state.lastAskedAt < COOLDOWN_DAYS * DAY_MS) return false;
  return true;
}

/** Record that we just asked (count + 1, last asked = now). No-op before the migration. */
export async function recordAsk(client: unknown, userId: string, state: AskState): Promise<void> {
  if (!state.known) return;
  try {
    await (client as StateClient)
      .from("subscriptions")
      .update({
        testimonial_ask_count: state.count + 1,
        testimonial_last_asked_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch (err) {
    console.error("testimonial-ask recordAsk failed", err);
  }
}

/**
 * Does this customer have an open ticket in the feedback Worker? Best-effort and
 * fail-open: if the Worker is not configured or unreachable we return false so a
 * support outage never blocks asks (nor sends us into a retry storm).
 */
export async function hasOpenSupportTicket(email: string | null | undefined): Promise<boolean> {
  const target = (email ?? "").trim().toLowerCase();
  if (!target || !isSupportWorkerConfigured()) return false;
  try {
    const qs = new URLSearchParams({
      statuses: OPEN_TICKET_STATUSES.join(","),
      q: target,
      limit: "25",
    });
    const res = await callSupportWorker<{
      tickets?: Array<{ userEmail?: string | null; requesterEmail?: string | null }>;
    }>(`/agent/inbox?${qs.toString()}`);
    if (!res.ok) return false;
    // The search is free text, so confirm the email actually matches a ticket.
    return (res.data.tickets ?? []).some(
      (t) =>
        (t.userEmail ?? "").trim().toLowerCase() === target ||
        (t.requesterEmail ?? "").trim().toLowerCase() === target,
    );
  } catch {
    return false;
  }
}
