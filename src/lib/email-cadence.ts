// Funnels v2 cadence cap: at most one lifecycle email per person per 44 hours.
//
// The built-in funnels (trial, apptrial, pro, onboarding, winback, conversion,
// upgrade) and lifecycle sequences can all reach the same person in the same
// week. Before a non-exempt funnel step sends, canSendLifecycle() looks at
// email_sends for a recent lifecycle send to that address. When one exists the
// step is DEFERRED: the caller does not stamp its *_sent_at column, so the
// next cron run reconsiders it.
//
// Exempt (always send):
//   - day0 of any funnel (the welcome is expected right away)
//   - apptrial day1 (the activation pair with day0)
//   - any step whose slot is "urgency" (trial day13/day14, apptrial day14,
//     conversion 5d): deadlines cannot wait
//   - any step more than 48h overdue, so a deferral can never make the cron's
//     most-aged-first rule skip a step for good
//
// Lookups are best-effort and fail OPEN (a read error allows the send), which
// is the pre-v2 behavior. Only the send path calls this, and only when
// funnelsV2Enabled().

import type { SupabaseClient } from "@supabase/supabase-js";

export const CADENCE_WINDOW_MS = 44 * 60 * 60 * 1000;
export const OVERDUE_EXEMPT_MS = 48 * 60 * 60 * 1000;

/** email_sends.funnel values that count toward the cap. Newsletters,
 * campaigns and transactional mail do not. */
export const LIFECYCLE_FUNNELS: readonly string[] = [
  "trial",
  "apptrial",
  "pro",
  "onboarding",
  "winback",
  "conversion",
  "upgrade",
  "sequence",
];

/** True when a funnel step skips the cap by its nature (day0, apptrial day1,
 * urgency slot). Overdue is checked separately in canSendLifecycle. */
export function isCadenceExemptStep(funnel: string, tier: string, slot?: string | null): boolean {
  if (tier === "day0") return true;
  if (funnel === "apptrial" && tier === "day1") return true;
  if (slot === "urgency") return true;
  return false;
}

export type CadenceReason = "exempt" | "overdue" | "clear" | "capped" | "lookup-failed";

export type CadenceDecision = {
  ok: boolean;
  reason: CadenceReason;
  /** created_at of the blocking send when reason = "capped". */
  lastSentAt: string | null;
};

/**
 * May this person get a lifecycle email right now?
 *   opts.tierIsExempt  true for day0 / apptrial day1 / urgency steps (see isCadenceExemptStep)
 *   opts.overdueMs     how far past its due time the step is; > 48h exempts it
 *   opts.windowMs      lookback, default 44h
 *   opts.funnels       which email_sends.funnel values count, default LIFECYCLE_FUNNELS
 * Counts only status = 'sent' rows (suppressed and failed sends never reached
 * the inbox). Read errors fail open.
 */
export async function canSendLifecycle(
  db: SupabaseClient,
  email: string,
  now: number = Date.now(),
  opts: {
    tierIsExempt?: boolean;
    overdueMs?: number | null;
    windowMs?: number;
    funnels?: readonly string[];
  } = {},
): Promise<CadenceDecision> {
  if (opts.tierIsExempt) return { ok: true, reason: "exempt", lastSentAt: null };
  if (typeof opts.overdueMs === "number" && opts.overdueMs > OVERDUE_EXEMPT_MS) {
    return { ok: true, reason: "overdue", lastSentAt: null };
  }
  const recipient = String(email ?? "").trim().toLowerCase();
  if (!recipient) return { ok: true, reason: "clear", lastSentAt: null };
  const windowMs = opts.windowMs ?? CADENCE_WINDOW_MS;
  const since = new Date(now - windowMs).toISOString();
  try {
    const res = await db
      .from("email_sends")
      .select("created_at")
      .eq("recipient", recipient)
      .eq("status", "sent")
      .in("funnel", [...(opts.funnels ?? LIFECYCLE_FUNNELS)])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (res.error) return { ok: true, reason: "lookup-failed", lastSentAt: null };
    const row = Array.isArray(res.data) ? (res.data[0] as { created_at?: unknown } | undefined) : undefined;
    if (row && typeof row.created_at === "string") {
      return { ok: false, reason: "capped", lastSentAt: row.created_at };
    }
    return { ok: true, reason: "clear", lastSentAt: null };
  } catch {
    return { ok: true, reason: "lookup-failed", lastSentAt: null };
  }
}
