const LS_API_BASE_URL = "https://api.lemonsqueezy.com/v1";

export async function lsApi(path: string, options: RequestInit = {}) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LEMONSQUEEZY_API_KEY environment variable");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(`${LS_API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...(options.headers ?? {}),
    },
  });
}

export type VariantResolution =
  | { ok: true; variantId: string }
  | { ok: false; reason: "missing-input" | "missing-env"; envVar?: string };

/**
 * Phase H1 (2026-05-20): the canonical "plan" → env-var → LS variant ID
 * lookup. Tiered Pro plans land alongside the existing monthly/annual
 * shorthand and the Daily Deals Workspace add-on.
 *
 * Plan strings recognised:
 *   - "monthly" / "annual"           — legacy aliases, still resolve to
 *                                       Pro Solo Monthly / Annual.
 *   - "solo-monthly" / "solo-annual"
 *   - "team-monthly" / "team-annual"
 *   - "agency-monthly" / "agency-annual"
 *   - "daily-deals-addon"            — $24.99/mo add-on SKU (no promos).
 */
const PLAN_ENV_VAR: Record<string, string> = {
  monthly: "LEMONSQUEEZY_VARIANT_MONTHLY",
  annual: "LEMONSQUEEZY_VARIANT_ANNUAL",
  "solo-monthly": "LEMONSQUEEZY_VARIANT_MONTHLY",
  "solo-annual": "LEMONSQUEEZY_VARIANT_ANNUAL",
  "team-monthly": "LEMONSQUEEZY_VARIANT_TEAM_MONTHLY",
  "team-annual": "LEMONSQUEEZY_VARIANT_TEAM_ANNUAL",
  "agency-monthly": "LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY",
  "agency-annual": "LEMONSQUEEZY_VARIANT_AGENCY_ANNUAL",
  "daily-deals-addon": "LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON",
};

export function resolveVariantId(
  plan: string | undefined,
  fallback: string | undefined,
): VariantResolution {
  if (plan) {
    const envVar = PLAN_ENV_VAR[plan];
    if (envVar) {
      const id = process.env[envVar];
      if (!id) return { ok: false, reason: "missing-env", envVar };
      return { ok: true, variantId: id };
    }
  }
  if (fallback) {
    return { ok: true, variantId: fallback };
  }
  return { ok: false, reason: "missing-input" };
}

/**
 * Is `variantId` the Daily Deals Workspace add-on? Used by both checkout
 * routes (belt 1 + 2 of the promo-exclusion contract) to skip discount /
 * affiliate-code / aff_ref paths whenever the customer is buying the
 * add-on.
 */
export function isAddonVariant(variantId: string | null | undefined): boolean {
  if (typeof variantId !== "string" || variantId.length === 0) return false;
  const addonId = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON;
  return !!addonId && variantId === addonId;
}

/**
 * Returns the variantIds list that discounts SHOULD scope to. The add-on
 * variant is intentionally absent — even if a future code path forgets to
 * check isAddonVariant before applying a discount, the LS-side scoping
 * (belt 3 of the contract) prevents the discount from applying to the
 * add-on at checkout.
 *
 * Returns every paid Pro variant ID we have configured. Empty if no Pro
 * variants are wired yet (LS treats no-scoping as "applies to all", which
 * is the unsafe default — callers should pass the array even if empty so
 * the caller can decide whether to skip discount creation entirely).
 */
export function getDiscountableVariantIds(): string[] {
  const ids: (string | undefined)[] = [
    process.env.LEMONSQUEEZY_VARIANT_MONTHLY,
    process.env.LEMONSQUEEZY_VARIANT_ANNUAL,
    process.env.LEMONSQUEEZY_VARIANT_TEAM_MONTHLY,
    process.env.LEMONSQUEEZY_VARIANT_TEAM_ANNUAL,
    process.env.LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY,
    process.env.LEMONSQUEEZY_VARIANT_AGENCY_ANNUAL,
  ];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}
