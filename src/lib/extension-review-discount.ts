// Mints the feedback-survey reward: a per-user, single-use code for 99% off the
// FIRST month of Pro. Kept in its own module so the Lemon Squeezy client is not
// pulled into the email-marketing cron bundle (which only needs the pure
// personalization helpers from extension-review.ts).

import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { EXT_REVIEW_DISCOUNT_PERCENT, EXT_REVIEW_DISCOUNT_TTL_DAYS } from "@/lib/extension-review";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a single-use LS discount for 99% off the first month of Pro, scoped to
 * the monthly variant only. Returns { code, discountId } or null if LS is not
 * configured / the API call failed. FIRST MONTH ONLY: durationMonths is omitted
 * so LS uses duration "once"; scoping to the ANNUAL variant with "once" would
 * hand out 99% off a whole year, which is not the offer.
 */
export async function mintFeedbackReward(): Promise<{ code: string; discountId: string } | null> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const monthlyVariant = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
  if (!storeId || !monthlyVariant) {
    console.error("extension-review-discount: LEMONSQUEEZY_STORE_ID / _VARIANT_MONTHLY not set");
    return null;
  }
  const expiresAt = new Date(Date.now() + EXT_REVIEW_DISCOUNT_TTL_DAYS * DAY_MS).toISOString();
  return createUniqueDiscount({
    storeId,
    percentOff: EXT_REVIEW_DISCOUNT_PERCENT,
    namePrefix: "EXTFB",
    variantIds: [monthlyVariant],
    name: `Extension feedback reward ${EXT_REVIEW_DISCOUNT_PERCENT}% first month`,
    expiresAt,
  });
}
