/**
 * Decides whether a Lemon Squeezy `subscription_updated` with status "active"
 * means a trial really converted to paid.
 *
 * LS can report a trial subscription as "active" while the trial is still
 * running (seen on a trial started and then changed minutes later, alongside a
 * second $0 invoice). Treating that as a conversion stamped trial_converted_at
 * on day 0, showed "Converted to paid" on affiliate dashboards for a customer
 * who never paid, and could fire the friend-referral reward. A trial has only
 * converted once its trial_ends_at has passed (LS keeps the original date on
 * the subscription after conversion), or when there is no trial at all. A real
 * charge is still caught independently by subscription_payment_success, which
 * stamps on any non-zero payment.
 */

/** Tolerance for LS emitting the conversion update slightly before trial_ends_at. */
export const TRIAL_END_SKEW_MS = 60 * 60 * 1000;

export function isRealTrialConversion(
  status: string | null | undefined,
  trialEndsAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (status !== "active") return false;
  if (!trialEndsAt) return true;
  const endsMs = Date.parse(trialEndsAt);
  if (Number.isNaN(endsMs)) return true;
  return endsMs <= nowMs + TRIAL_END_SKEW_MS;
}
