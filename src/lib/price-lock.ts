/**
 * Price lock (Nov 12 - Nov 30 2026). Deadline: Mon Nov 30 2026, 11:59pm
 * Pacific. The prices and the cutover instant live in PRICE_CHANGE
 * (src/lib/pricing-constants.ts); the variant families live in
 * src/lib/lemonsqueezy.ts (resolveCheckoutVariant, NEXT_VARIANT_IDS).
 *
 * Rules (owner, 2026-11-11):
 *   1. Existing Lemon Squeezy variants are never edited. New variants carry the
 *      new prices and new checkouts switch to them at the deadline.
 *   2. Paying subscribers keep their price while subscribed (Lemon Squeezy keeps
 *      a subscription on the price it was created with; plan switches stay in
 *      the subscriber's own family). Cancel and come back = new price.
 *   3. Trials started before the deadline convert at the old price.
 *   4. Comps that add a card before the deadline keep the old price.
 *   5. Everything flips on its own at the deadline.
 */
import { PRICE_CHANGE, TRIAL_LENGTH_DAYS, priceChangeActive } from "@/lib/pricing-constants";

export const PRICE_LOCK_DEADLINE_MS = Date.parse(PRICE_CHANGE.effectiveAt);

/** When the push started (Thu Nov 12 2026, 00:00 Pacific). Used by tracking. */
export const PRICE_LOCK_PUSH_START = "2026-11-12T08:00:00Z";

/** True until the new prices start. */
export function priceLockOpen(now: number = Date.now()): boolean {
  return priceChangeActive(now);
}

/** Milliseconds left until the new prices start (0 once passed). */
export function msUntilPriceChange(now: number = Date.now()): number {
  return Math.max(0, PRICE_LOCK_DEADLINE_MS - now);
}

type GrantLike = { kind: string | null; expiresAt: string | null; cancelledAt: string | null };

/**
 * Rule 3 for no-card trials (in-house `kind: "trial"` comps, which have no Lemon
 * Squeezy subscription yet): a trial that began before the deadline and is
 * still running keeps the old price at checkout. The start is derived from the
 * end date (trials are TRIAL_LENGTH_DAYS long), since comp_grants rows read by
 * checkout do not carry issued_at.
 */
export function keepsPreDeadlinePrice(grants: GrantLike[], now: number = Date.now()): boolean {
  if (priceChangeActive(now)) return false; // nothing to keep yet
  return grants.some((g) => {
    if (g.kind !== "trial" || g.cancelledAt || !g.expiresAt) return false;
    const end = Date.parse(g.expiresAt);
    if (!Number.isFinite(end) || end <= now) return false;
    const start = end - TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;
    return start < PRICE_LOCK_DEADLINE_MS;
  });
}
