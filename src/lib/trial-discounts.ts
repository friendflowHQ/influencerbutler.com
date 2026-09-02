// Per-user Lemon Squeezy trial discount codes: a first-month discount for the
// monthly plan and an annual-switch discount, both single-use and expiring
// 1 day after the trial ends. Minted by the LS webhook when a trial starts;
// the affiliate-funnel cron re-mints any code that's still missing (webhook
// mint failed or env was misconfigured at trial start) while the trial is
// still running.

import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";

export type TrialDiscountColumns = {
  trial_discount_code_monthly: string | null;
  trial_discount_code_annual: string | null;
  ls_discount_id_monthly: string | null;
  ls_discount_id_annual: string | null;
};

function readPercent(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return fallback;
  return parsed;
}

export function trialDiscountPercents(): { monthlyPercent: number; annualPercent: number } {
  return {
    monthlyPercent: readPercent("TRIAL_DISCOUNT_MONTHLY_PERCENT", 20),
    annualPercent: readPercent("TRIAL_DISCOUNT_ANNUAL_PERCENT", 30),
  };
}

/**
 * Mints the per-user trial discount codes in Lemon Squeezy:
 *   - monthly first-month discount, restricted to the monthly variant
 *   - annual-switch discount, restricted to the annual variant
 * Both expire 1 day after `trialEndsAt`. Failures are logged and the field
 * comes back null; callers should persist whatever was minted and retry the
 * rest later (the cron does this for rows with null code columns).
 *
 * `skipMonthly` / `skipAnnual` let the cron retry path mint only the code
 * that's still missing; skipped fields come back null and must not be
 * written over existing values.
 */
export async function mintTrialDiscounts(input: {
  trialEndsAt: string | null;
  userId: string;
  skipMonthly?: boolean;
  skipAnnual?: boolean;
}): Promise<TrialDiscountColumns | null> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const monthlyVariant = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
  const annualVariant = process.env.LEMONSQUEEZY_VARIANT_ANNUAL;
  if (!storeId) {
    console.error("mintTrialDiscounts: LEMONSQUEEZY_STORE_ID not set");
    return null;
  }
  if (!monthlyVariant || !annualVariant) {
    // Without variant scoping the discount would apply to every SKU,
    // including the Deals add-on (promo-exclusion contract). Refuse
    // to mint an unscoped code rather than mint a dangerous one.
    console.error("mintTrialDiscounts: variant env missing", {
      hasMonthlyVariant: Boolean(monthlyVariant),
      hasAnnualVariant: Boolean(annualVariant),
    });
  }

  const { monthlyPercent, annualPercent } = trialDiscountPercents();

  let expiresAt: string | null = null;
  if (input.trialEndsAt) {
    const end = new Date(input.trialEndsAt);
    if (Number.isFinite(end.getTime())) {
      expiresAt = new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
  }

  const monthly =
    monthlyVariant && !input.skipMonthly
      ? await createUniqueDiscount({
          storeId,
          percentOff: monthlyPercent,
          namePrefix: "TRIAL",
          expiresAt,
          variantIds: [monthlyVariant],
          name: `Trial welcome ${monthlyPercent}% (monthly, user ${input.userId.slice(0, 8)})`,
        })
      : null;

  const annual =
    annualVariant && !input.skipAnnual
      ? await createUniqueDiscount({
          storeId,
          percentOff: annualPercent,
          namePrefix: "ANNUAL",
          expiresAt,
          variantIds: [annualVariant],
          name: `Trial annual-switch ${annualPercent}% (user ${input.userId.slice(0, 8)})`,
        })
      : null;

  if (!monthly && !annual) {
    return null;
  }

  return {
    trial_discount_code_monthly: monthly?.code ?? null,
    trial_discount_code_annual: annual?.code ?? null,
    ls_discount_id_monthly: monthly?.discountId ?? null,
    ls_discount_id_annual: annual?.discountId ?? null,
  };
}
