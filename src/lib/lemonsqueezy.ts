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

/**
 * A license key resolved directly from the Lemon Squeezy API, used as a
 * read-time fallback when the local license_keys table has no row (e.g. the
 * license_key_created webhook never landed). Field names follow our internal
 * shape, not the raw LS attribute names.
 */
export type LsLicense = {
  lsLicenseKeyId: string;
  key: string;
  status: string;
  activationLimit: number | null;
  activationsCount: number | null;
};

type LsLicenseKeyAttributes = {
  key?: string | null;
  status?: string | null;
  activation_limit?: number | null;
  // LS calls the activations counter instances_count.
  instances_count?: number | null;
  disabled?: boolean | null;
};

type LsLicenseKey = {
  id?: string;
  attributes?: LsLicenseKeyAttributes;
};

/**
 * Returns the LS order ids for an email, most recent first (LS sorts orders
 * by created_at descending by default).
 */
async function fetchOrderIdsForEmail(email: string): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("filter[user_email]", email);
  params.set("page[size]", "50");

  const response = await lsApi(`/orders?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("lemonsqueezy: orders lookup failed", {
      status: response.status,
      text: text.slice(0, 500),
    });
    return [];
  }

  const payload = (await response.json()) as { data?: { id?: string }[] };
  return (payload.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Picks the best key from an order: prefer enabled + active, else the first. */
function pickBestLicenseKey(keys: LsLicenseKey[]): LsLicenseKey | null {
  let fallback: LsLicenseKey | null = null;
  for (const key of keys) {
    if (!key.id || !key.attributes?.key) continue;
    if (!fallback) fallback = key;
    const a = key.attributes;
    if (!a.disabled && a.status === "active") return key;
  }
  return fallback;
}

/**
 * Resolves a user's license directly from Lemon Squeezy by email. LS license
 * keys cannot be filtered by email, so we go orders-by-email then
 * license-keys-by-order. Returns null if the user has no license in LS.
 */
export async function fetchLicenseFromLs(email: string): Promise<LsLicense | null> {
  const orderIds = await fetchOrderIdsForEmail(email);

  for (const orderId of orderIds) {
    const params = new URLSearchParams();
    params.set("filter[order_id]", orderId);
    params.set("page[size]", "50");

    const response = await lsApi(`/license-keys?${params.toString()}`, { method: "GET" });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("lemonsqueezy: license-keys lookup failed", {
        status: response.status,
        orderId,
        text: text.slice(0, 500),
      });
      continue;
    }

    const payload = (await response.json()) as { data?: LsLicenseKey[] };
    const best = pickBestLicenseKey(payload.data ?? []);
    if (best?.id && best.attributes?.key) {
      const a = best.attributes;
      return {
        lsLicenseKeyId: best.id,
        key: a.key as string,
        status: a.status ?? "active",
        activationLimit: a.activation_limit ?? null,
        activationsCount: a.instances_count ?? null,
      };
    }
  }

  return null;
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
 *   - "monthly" / "annual"           - legacy aliases, still resolve to
 *                                       Pro Solo Monthly / Annual.
 *   - "solo-monthly" / "solo-annual"
 *   - "team-monthly" / "team-annual"
 *   - "agency-monthly" / "agency-annual"
 *   - "daily-deals-addon"            - $24.99/mo add-on SKU (no promos).
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
 * variant is intentionally absent - even if a future code path forgets to
 * check isAddonVariant before applying a discount, the LS-side scoping
 * (belt 3 of the contract) prevents the discount from applying to the
 * add-on at checkout.
 *
 * Returns every paid Pro variant ID we have configured. Empty if no Pro
 * variants are wired yet (LS treats no-scoping as "applies to all", which
 * is the unsafe default - callers should pass the array even if empty so
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

// Maps each tier's monthly variant env var to its annual counterpart. Used to
// resolve the "switch to annual" upgrade target for an existing subscription.
const MONTHLY_TO_ANNUAL_ENV: Record<string, string> = {
  LEMONSQUEEZY_VARIANT_MONTHLY: "LEMONSQUEEZY_VARIANT_ANNUAL",
  LEMONSQUEEZY_VARIANT_TEAM_MONTHLY: "LEMONSQUEEZY_VARIANT_TEAM_ANNUAL",
  LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY: "LEMONSQUEEZY_VARIANT_AGENCY_ANNUAL",
};

/**
 * Given a subscription's current variant id, returns the same tier's annual
 * variant id, or null when the current variant is not a known monthly variant
 * (i.e. it is already annual, is the add-on, or is unconfigured). Callers use
 * a null return as "not eligible to upgrade to annual".
 */
export function resolveAnnualVariantForMonthly(
  currentVariantId: string | number | null | undefined,
): string | null {
  if (currentVariantId == null) return null;
  const current = String(currentVariantId);
  for (const [monthlyEnv, annualEnv] of Object.entries(MONTHLY_TO_ANNUAL_ENV)) {
    const monthlyId = process.env[monthlyEnv];
    if (monthlyId && monthlyId === current) {
      const annualId = process.env[annualEnv];
      return annualId && annualId.length > 0 ? annualId : null;
    }
  }
  return null;
}
