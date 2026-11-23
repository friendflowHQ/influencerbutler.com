// Who may book a 1:1 call, and how often.
//
// Owner decision (2026-11-23): 1:1 calls do not pay for the hour they take, so
// from the new year they are a perk of Power User plans (any seat count) plus
// the legacy Team and Agency plans, limited to one Priority 1:1 per calendar
// month. The free Setup call goes away; hands-on setup becomes a paid session,
// and everyone else is pointed at the group sessions, videos and the AI helper.
//
// The policy is dated so customers get notice first: before the start time it
// does nothing and every existing rule in /api/booking/create applies exactly
// as before. Move the date with CALL_POLICY_EFFECTIVE_AT (ISO 8601) without a
// deploy of code, or set it to a past date to switch the policy on early.
//
// Pure functions only (no database), so the rules are unit-tested in
// src/lib/__tests__/call-policy.test.ts. The route does the one query it needs
// (this month's bookings) and passes the count in.

import type { CallTypeKey } from "@/lib/scheduling";

/** Default start: the first moment of 2027, UTC. */
export const CALL_POLICY_DEFAULT_START_ISO = "2027-01-01T00:00:00Z";

/** Priority 1:1 calls a customer may hold per calendar month (UTC) once the policy is on. */
export const MONTHLY_SUPPORT_CALL_LIMIT = 1;

export const CALL_POLICY_CODES = {
  setupCallPaid: "setup_call_paid",
  notInPlan: "calls_not_in_plan",
  monthlyLimit: "monthly_call_limit",
} as const;

export function callPolicyStartMs(envValue: string | undefined = process.env.CALL_POLICY_EFFECTIVE_AT): number {
  const parsed = Date.parse((envValue || "").trim());
  return Number.isFinite(parsed) ? parsed : Date.parse(CALL_POLICY_DEFAULT_START_ISO);
}

export function callPolicyActive(now: number, envValue?: string): boolean {
  return now >= callPolicyStartMs(envValue);
}

/**
 * True when the canonical plan string (see planForVariantId) includes 1:1 calls.
 * Power User at any seat count, and the pre-split Team and Agency plans.
 * Beginner, the pre-split Solo and Duo plans, add-ons, comps and unknown
 * variants (null) do not.
 */
export function planIncludesCalls(plan: string | null | undefined): boolean {
  if (!plan) return false;
  if (plan.startsWith("power-")) return true;
  return plan.startsWith("team-") || plan.startsWith("agency-");
}

/** The UTC calendar month containing an instant, as ISO bounds [from, to). */
export function utcMonthBounds(instantMs: number): { fromIso: string; toIso: string } {
  const d = new Date(instantMs);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
}

export type CallPolicyVerdict =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

export type CallPolicyInput = {
  type: CallTypeKey;
  now: number;
  /** Canonical plan string for the customer's latest subscription, or null. */
  plan: string | null;
  /** True for a partner-reserved slot (a separate program with its own limits). */
  partnerReserved?: boolean;
  /** Non-cancelled Priority 1:1 bookings already in the requested slot's month. */
  supportBookingsInMonth: number;
  /** Optional link to buy the paid Setup session, shown in the message when set. */
  setupSessionUrl?: string | null;
  /** Test hook for the effective date. */
  effectiveAtEnv?: string;
};

export function checkCallPolicy(input: CallPolicyInput): CallPolicyVerdict {
  if (!callPolicyActive(input.now, input.effectiveAtEnv)) return { ok: true };

  if (input.type === "demo") {
    // Partner-reserved Setup slots are a separate, limited program: unchanged.
    if (input.partnerReserved) return { ok: true };
    const buy = input.setupSessionUrl ? ` You can book one here: ${input.setupSessionUrl}` : "";
    return {
      ok: false,
      status: 403,
      code: CALL_POLICY_CODES.setupCallPaid,
      error:
        "The free Setup call has ended. Hands-on setup is now a paid one-time Setup session." + buy +
        " To set up on your own, open the Setup checklist in the app, watch the video guides in the Help center, " +
        "or join the next live group session. The AI Concierge can also walk you through any step, 24/7.",
    };
  }

  if (input.type === "support") {
    if (!planIncludesCalls(input.plan)) {
      return {
        ok: false,
        status: 403,
        code: CALL_POLICY_CODES.notInPlan,
        error:
          "1:1 calls are part of the Power User, Team and Agency plans. On your plan, the fastest help is the " +
          "AI Concierge (24/7), the video guides in the Help center, and the live group sessions. " +
          "You can upgrade any time from the app (Settings, Subscription) or your dashboard.",
      };
    }
    if (input.supportBookingsInMonth >= MONTHLY_SUPPORT_CALL_LIMIT) {
      return {
        ok: false,
        status: 409,
        code: CALL_POLICY_CODES.monthlyLimit,
        error:
          "You have already booked your 1:1 call for that month. Plans include one call per calendar month. " +
          "Pick a time next month, or use the AI Concierge and the live group sessions in the meantime.",
      };
    }
  }

  return { ok: true };
}
