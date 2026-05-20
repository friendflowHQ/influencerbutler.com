/**
 * Pricing + plan constants shared between the marketing site (pricing
 * page, landing pages, checkout routes) and the LS configuration.
 *
 * Single source of truth so dollar amounts + plan identifiers don't
 * drift between the customer-facing copy and the backend.
 */

// Per-plan price in cents (used by promo-resolver math).
export const PRICE_CENTS = {
  solo: { monthly: 2900, annual: 26100 },
  team: { monthly: 6900, annual: 61900 },
  agency: { monthly: 14900, annual: 133900 },
} as const;

// Per-tier seat count (mirrors LS product activation_limit setting).
export const SEAT_LIMIT = {
  solo: 1,
  team: 10,
  agency: 25,
} as const;

// Daily Deals Workspace add-on — flat $24.99/month, no promo codes apply.
export const DAILY_DEALS_ADDON_PRICE_USD = 24.99;
export const DAILY_DEALS_ADDON_PRICE_CENTS = 2499;
export const ADDON_PLAN_DAILY_DEALS = "daily-deals-addon" as const;

// Annual discount (the "cents off" the customer saves by paying annually
// vs. 12× monthly). Exposed for the marketing copy that highlights the
// per-tier dollar savings on annual.
export function annualSavingsCents(tier: keyof typeof PRICE_CENTS): number {
  const tierPrices = PRICE_CENTS[tier];
  return tierPrices.monthly * 12 - tierPrices.annual;
}

// Per-tier label used in the marketing copy. Solo intentionally says
// "1 device" to underline the upgrade pressure — if the customer wants
// a 2nd device, they upgrade to Team.
export const SEAT_COPY = {
  solo: "1 device",
  team: "Up to 10 devices",
  agency: "Up to 25 devices",
} as const;

export type Tier = keyof typeof PRICE_CENTS;
export type Interval = "monthly" | "annual";
