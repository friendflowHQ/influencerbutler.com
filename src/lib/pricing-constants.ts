/**
 * Pricing + plan constants shared between the marketing site (pricing
 * page, landing pages, checkout routes) and the LS configuration.
 *
 * Single source of truth so dollar amounts + plan identifiers don't
 * drift between the customer-facing copy and the backend.
 */

// Length of the free Pro trial, in days. This mirrors the Lemon Squeezy Pro
// SKU trial period (LS `trial_ends_at` is authoritative for billing) and the
// desktop app's local trial clock. The trial-email drip in
// /api/cron/affiliate-funnel derives all of its send thresholds from this, so
// a change to the trial length is a one-line change here.
export const TRIAL_LENGTH_DAYS = 14;

// Per-plan price in cents (used by promo-resolver math).
export const PRICE_CENTS = {
  solo: { monthly: 3900, annual: 39000 },
  team: { monthly: 12900, annual: 129000 },
  agency: { monthly: 29900, annual: 299000 },
} as const;

// Per-tier seat count (mirrors LS product activation_limit setting).
export const SEAT_LIMIT = {
  solo: 1,
  team: 10,
  agency: 25,
} as const;

// Daily Deals Workspace add-on - flat $24.99/month, no promo codes apply.
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

// Annual discount expressed as a whole-number percent (e.g. 17 for "Save
// 17%"). All current tiers happen to land on the same 17%, but compute
// it per-tier so the badges stay correct if a future tier diverges.
export function annualSavingsPct(tier: keyof typeof PRICE_CENTS): number {
  const tierPrices = PRICE_CENTS[tier];
  const fullYear = tierPrices.monthly * 12;
  return Math.round(((fullYear - tierPrices.annual) / fullYear) * 100);
}

// Per-tier label used in the marketing copy. Solo intentionally says
// "1 device" to underline the upgrade pressure - if the customer wants
// a 2nd device, they upgrade to Team.
export const SEAT_COPY = {
  solo: "1 device",
  team: "Up to 10 devices",
  agency: "Up to 25 devices",
} as const;

export type Tier = keyof typeof PRICE_CENTS;
export type Interval = "monthly" | "annual";

// Display copy for the tier picker. Co-located with PRICE_CENTS so a
// price change can't ship without thinking about the user-facing copy.
export const TIER_NAME: Record<Tier, string> = {
  solo: "Pro Solo",
  team: "Pro Team",
  agency: "Pro Agency",
};

export const TIER_TAGLINE: Record<Tier, string> = {
  solo: "Full power, 1 device",
  team: "For creator teams - up to 10 devices",
  agency: "For agencies - up to 25 devices",
};

// Marketing feature lists per tier. The dashboard subscription page and
// the public /pricing page both render these verbatim.
export const TIER_FEATURES: Record<Tier, readonly string[]> = {
  solo: [
    "All 40+ automation tools",
    "Unlimited CC brand messages",
    "Unlimited Instagram DMs",
    "Commission harvesting",
    "Deep link & affiliate integrations",
    "1 activated device",
  ],
  team: [
    "Everything in Pro Solo",
    "Up to 10 activated devices",
    "Shared seat pool for your team",
    "Priority email support",
  ],
  agency: [
    "Everything in Pro Team",
    "Up to 25 activated devices",
    "Priority feature requests",
    "Dedicated support",
    "Early access to new butlers",
  ],
} as const;

// Free forever tier. Not part of the paid Tier record (no price, no seat
// pressure) so it lives as standalone constants the pricing UI renders as a
// band above the paid cards. What "free" unlocks is defined in
// src/lib/entitlements.ts (FREE_BUTLER_SLUGS) - keep the copy below in sync.
export const FREE_TIER_NAME = "Free forever";
export const FREE_TIER_TAGLINE = "The whole extension plus See & Organize butlers. No card, no expiry.";
export const FREE_TIER_FEATURES: readonly string[] = [
  "The whole Chrome extension, no login: video counts, content gaps, Butler Approved seals, storefront checks",
  "Like Butler & Benable Like Butler: auto-like at a safe pace",
  "CC Check: grab every ASIN from any page",
  "Orders Butler: pull your full Amazon order history",
  "Storefront Butler: audit your photo & video coverage",
  "Influencer Butler branded deep links + Link Performance click dashboard",
];

// Plan-string canonical form used by /api/checkout + /api/checkout/guest
// and the dashboard/public pricing UIs. Legacy "monthly"/"annual" strings
// (no tier prefix) resolve to Solo so existing checkout links keep working.
export type PlanString =
  | "monthly"
  | "annual"
  | "solo-monthly"
  | "solo-annual"
  | "team-monthly"
  | "team-annual"
  | "agency-monthly"
  | "agency-annual"
  | typeof ADDON_PLAN_DAILY_DEALS;

const TIER_BY_PLAN: Record<string, Tier | "addon"> = {
  monthly: "solo",
  annual: "solo",
  "solo-monthly": "solo",
  "solo-annual": "solo",
  "team-monthly": "team",
  "team-annual": "team",
  "agency-monthly": "agency",
  "agency-annual": "agency",
  [ADDON_PLAN_DAILY_DEALS]: "addon",
};

const CADENCE_BY_PLAN: Record<string, Interval | null> = {
  monthly: "monthly",
  annual: "annual",
  "solo-monthly": "monthly",
  "solo-annual": "annual",
  "team-monthly": "monthly",
  "team-annual": "annual",
  "agency-monthly": "monthly",
  "agency-annual": "annual",
  [ADDON_PLAN_DAILY_DEALS]: null,
};

const INTERVAL_BY_CADENCE: Record<Interval, "month" | "year"> = {
  monthly: "month",
  annual: "year",
};

export function planStringFor(tier: Tier, interval: Interval): PlanString {
  // Solo keeps the bare "monthly"/"annual" strings for backwards-compat
  // with checkout links + LS env-var aliases. Team/Agency are explicit.
  if (tier === "solo") return interval === "monthly" ? "monthly" : "annual";
  return `${tier}-${interval}` as PlanString;
}

export function tierForPlan(plan: string | undefined | null): Tier | null {
  if (!plan) return null;
  const t = TIER_BY_PLAN[plan];
  return t && t !== "addon" ? t : null;
}

/**
 * Resolves a plan string ("monthly" | "team-annual" | "daily-deals-addon"
 * | ...) to the price/interval pair the promo resolver expects. Returns
 * null for unknown plans so callers can fall back to a zero-priced
 * placeholder (matches the previous behaviour of the route handlers).
 *
 * Shared between /api/checkout and /api/checkout/guest so the savings
 * math can't drift between authed and guest flows.
 */
export function planMetaFor(
  plan: string | undefined | null,
): { priceCents: number; interval: "month" | "year" } | null {
  if (!plan) return null;
  if (plan === ADDON_PLAN_DAILY_DEALS) {
    return { priceCents: DAILY_DEALS_ADDON_PRICE_CENTS, interval: "month" };
  }
  const tier = tierForPlan(plan);
  const cadence = CADENCE_BY_PLAN[plan];
  if (!tier || !cadence) return null;
  return {
    priceCents: PRICE_CENTS[tier][cadence],
    interval: INTERVAL_BY_CADENCE[cadence],
  };
}
