/**
 * Affiliate "comp workspace": the guardrails for a trusted ("main squeeze")
 * affiliate handing out a limited free Pro workspace to a prospect.
 *
 * These affiliates get wiggle room to convert people, NOT an open tap: every
 * comp they issue is a single-seat Solo Pro workspace, capped at a hard 2-month
 * (60-day) window, and limited to a per-affiliate monthly quota an admin sets.
 * The actual minting reuses the in-house comp machinery (src/lib/comp-issue.ts);
 * this module is the pure policy layer (duration + quota), kept free of I/O so it
 * can be unit tested and shared between the route and the dashboard.
 */

/** Hard ceilings. An affiliate comp can never exceed these, whatever they ask for. */
export const AFFILIATE_COMP_MAX_MONTHS = 2;
export const AFFILIATE_COMP_MAX_DAYS = 60;

/** Affiliate comps are always Solo Pro monthly, single seat. */
export const AFFILIATE_COMP_PLAN = "monthly";
export const AFFILIATE_COMP_SEATS = 1;

export type CompDurationUnit = "day" | "month";

export type NormalizedCompDuration =
  | { ok: true; days: number | null; months: number | null }
  | { ok: false; error: string };

/**
 * Validate + clamp an affiliate-chosen duration to the 2-month / 60-day ceiling.
 * Returns exactly one of `days` / `months` set (the other null), matching what
 * issueInHouseComp expects. Rejects (never silently clamps) an over-limit value
 * so the affiliate sees why.
 */
export function normalizeAffiliateCompDuration(input: {
  unit: unknown;
  amount: unknown;
}): NormalizedCompDuration {
  const unit: CompDurationUnit | null =
    input.unit === "day" || input.unit === "month" ? input.unit : null;
  if (!unit) return { ok: false, error: "Choose a duration in days or months." };

  const amount =
    typeof input.amount === "number" ? input.amount : Number.parseInt(String(input.amount), 10);
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, error: "Enter a whole number of days or months." };
  }

  if (unit === "month") {
    if (amount > AFFILIATE_COMP_MAX_MONTHS) {
      return { ok: false, error: `Comps can be at most ${AFFILIATE_COMP_MAX_MONTHS} months.` };
    }
    return { ok: true, days: null, months: amount };
  }

  // days
  if (amount > AFFILIATE_COMP_MAX_DAYS) {
    return {
      ok: false,
      error: `Comps can be at most ${AFFILIATE_COMP_MAX_DAYS} days (2 months).`,
    };
  }
  return { ok: true, days: amount, months: null };
}

/**
 * UTC start-of-month ISO for the month containing `now`. The affiliate's monthly
 * quota counts comps issued at or after this instant.
 */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export type CompQuotaState = {
  /** The affiliate may issue comps at all (quota set above zero). */
  enabled: boolean;
  quota: number;
  usedThisMonth: number;
  remaining: number;
};

/**
 * Derive the affiliate's comp allowance state from their stored quota (NULL / 0 =
 * disabled) and how many they have already issued this calendar month.
 */
export function compQuotaState(quota: number | null, usedThisMonth: number): CompQuotaState {
  const q =
    typeof quota === "number" && Number.isFinite(quota) ? Math.max(0, Math.floor(quota)) : 0;
  const used = Number.isFinite(usedThisMonth) ? Math.max(0, Math.floor(usedThisMonth)) : 0;
  return {
    enabled: q > 0,
    quota: q,
    usedThisMonth: used,
    remaining: Math.max(0, q - used),
  };
}
