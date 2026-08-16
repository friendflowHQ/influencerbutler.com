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

/** One activated device/install of a license key, per Lemon Squeezy. */
export type LsLicenseInstance = {
  id: string;
  /** The instance UUID the License API expects for deactivation. */
  identifier: string;
  name: string | null;
  createdAt: string | null;
};

type LsInstanceResource = {
  id?: string;
  attributes?: {
    identifier?: string | null;
    name?: string | null;
    created_at?: string | null;
  };
};

/**
 * Lists the activation instances for a license key (main API). Returns [] on
 * any API failure so callers degrade to "could not load devices".
 */
export async function fetchLicenseInstances(
  lsLicenseKeyId: string,
): Promise<LsLicenseInstance[] | null> {
  try {
    const params = new URLSearchParams();
    params.set("filter[license_key_id]", lsLicenseKeyId);
    params.set("page[size]", "100");
    const response = await lsApi(`/license-key-instances?${params.toString()}`, { method: "GET" });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("lemonsqueezy: license instances lookup failed", {
        status: response.status,
        text: text.slice(0, 500),
      });
      return null;
    }
    const payload = (await response.json()) as { data?: LsInstanceResource[] };
    return (payload.data ?? [])
      .filter((item): item is LsInstanceResource & { id: string } => typeof item.id === "string")
      .map((item) => ({
        id: item.id,
        identifier: item.attributes?.identifier ?? "",
        name: item.attributes?.name ?? null,
        createdAt: item.attributes?.created_at ?? null,
      }))
      .filter((item) => item.identifier.length > 0);
  } catch (error) {
    console.error("lemonsqueezy: license instances lookup threw", error);
    return null;
  }
}

/**
 * Deactivates one instance of a license key via the License API. Unlike the
 * main API this endpoint authenticates with the license key itself and speaks
 * plain application/json, so it gets a dedicated fetch instead of lsApi.
 */
export async function deactivateLicenseInstance(
  licenseKey: string,
  instanceIdentifier: string,
): Promise<boolean> {
  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/licenses/deactivate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ license_key: licenseKey, instance_id: instanceIdentifier }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("lemonsqueezy: license deactivate failed", {
        status: response.status,
        text: text.slice(0, 500),
      });
      return false;
    }
    const payload = (await response.json().catch(() => null)) as { deactivated?: boolean } | null;
    return payload?.deactivated === true;
  } catch (error) {
    console.error("lemonsqueezy: license deactivate threw", error);
    return false;
  }
}

/** LS subscription statuses that represent a live, billing-capable sub. */
const LIVE_SUB_STATUSES = new Set(["active", "on_trial", "past_due"]);

/**
 * True when Lemon Squeezy already has a live (active / on_trial / past_due)
 * subscription for this email. Used by the checkout double-subscribe guard as a
 * fallback for when the local subscriptions row hasn't landed yet or is mapped
 * to a different user_id (email-match linking is fragile - see the subscription
 * details route). Fails OPEN (returns false) on any LS error so a transient API
 * blip never blocks a legitimate first-time signup.
 */
export async function hasLiveSubscriptionForEmail(email: string): Promise<boolean> {
  try {
    const params = new URLSearchParams();
    params.set("filter[user_email]", email);
    params.set("page[size]", "50");

    const response = await lsApi(`/subscriptions?${params.toString()}`, { method: "GET" });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("lemonsqueezy: live-subscription lookup failed", {
        status: response.status,
        text: text.slice(0, 500),
      });
      return false; // fail open
    }

    const payload = (await response.json()) as {
      data?: { attributes?: { status?: string | null } }[];
    };
    return (payload.data ?? []).some((s) =>
      LIVE_SUB_STATUSES.has(s.attributes?.status ?? ""),
    );
  } catch (error) {
    console.error("lemonsqueezy: live-subscription lookup threw", error);
    return false; // fail open
  }
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
 *   - "duo-monthly" / "duo-annual"
 *   - "team-monthly" / "team-annual"
 *   - "agency-monthly" / "agency-annual"
 *   - "daily-deals-addon"            - $24.99/mo add-on SKU (no promos).
 */
const PLAN_ENV_VAR: Record<string, string> = {
  monthly: "LEMONSQUEEZY_VARIANT_MONTHLY",
  annual: "LEMONSQUEEZY_VARIANT_ANNUAL",
  "solo-monthly": "LEMONSQUEEZY_VARIANT_MONTHLY",
  "solo-annual": "LEMONSQUEEZY_VARIANT_ANNUAL",
  "duo-monthly": "LEMONSQUEEZY_VARIANT_DUO_MONTHLY",
  "duo-annual": "LEMONSQUEEZY_VARIANT_DUO_ANNUAL",
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
    process.env.LEMONSQUEEZY_VARIANT_DUO_MONTHLY,
    process.env.LEMONSQUEEZY_VARIANT_DUO_ANNUAL,
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
  LEMONSQUEEZY_VARIANT_DUO_MONTHLY: "LEMONSQUEEZY_VARIANT_DUO_ANNUAL",
  LEMONSQUEEZY_VARIANT_TEAM_MONTHLY: "LEMONSQUEEZY_VARIANT_TEAM_ANNUAL",
  LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY: "LEMONSQUEEZY_VARIANT_AGENCY_ANNUAL",
};

// Canonical (tier-prefixed) plan strings, in display order. The bare
// "monthly"/"annual" aliases are deliberately absent: they share env vars
// with solo-* and would make the variant-id inverse lookup ambiguous.
const CANONICAL_PLAN_STRINGS = [
  "solo-monthly",
  "solo-annual",
  "duo-monthly",
  "duo-annual",
  "team-monthly",
  "team-annual",
  "agency-monthly",
  "agency-annual",
  "daily-deals-addon",
] as const;

export type CanonicalPlanString = (typeof CANONICAL_PLAN_STRINGS)[number];

/**
 * Inverse of PLAN_ENV_VAR: resolves an LS variant id back to its canonical
 * plan string ("solo-monthly", "duo-annual", ...). Returns null for unknown
 * or unconfigured variants. Never returns the bare "monthly"/"annual"
 * aliases.
 */
export function planForVariantId(
  variantId: string | number | null | undefined,
): CanonicalPlanString | null {
  if (variantId == null) return null;
  const id = String(variantId);
  if (id.length === 0) return null;
  for (const plan of CANONICAL_PLAN_STRINGS) {
    const envVar = PLAN_ENV_VAR[plan];
    const candidate = envVar ? process.env[envVar] : undefined;
    if (candidate && candidate === id) return plan;
  }
  return null;
}

/**
 * Sets a license key's activation_limit via the main LS API. Used by the
 * webhook seat-resync after a plan change so the key's device cap follows
 * the new tier. Returns false (and logs) on any API failure.
 */
export async function setLicenseKeyActivationLimit(
  lsLicenseKeyId: string,
  limit: number,
): Promise<boolean> {
  try {
    const response = await lsApi(`/license-keys/${lsLicenseKeyId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "license-keys",
          id: lsLicenseKeyId,
          attributes: { activation_limit: limit },
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("lemonsqueezy: license activation_limit patch failed", {
        status: response.status,
        lsLicenseKeyId,
        text: text.slice(0, 500),
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("lemonsqueezy: license activation_limit patch threw", error);
    return false;
  }
}

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

// --- Comp backfill helpers -------------------------------------------------
// Used by /api/admin/comps/backfill to reconstruct comps that were issued before
// the discount-capture webhook (so they never landed in our orders data) from
// Lemon Squeezy's discount + redemption records.

export type LsCompDiscount = { id: string; code: string | null; name: string | null };
export type LsDiscountRedemption = {
  lsOrderId: string | null;
  discountCode: string | null;
  createdAt: string | null;
};

type LsPageMeta = { meta?: { page?: { last_page?: number } } };

/**
 * Lists Lemon Squeezy discounts that look like comps: 100%-off percent codes, or
 * whose code/name mentions FREE. Pages until exhausted or `maxPages`.
 */
export async function listCompLikeDiscounts(maxPages = 20): Promise<LsCompDiscount[]> {
  const out: LsCompDiscount[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await lsApi(`/discounts?page[size]=100&page[number]=${page}`, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("listCompLikeDiscounts: fetch failed", { status: res.status, text: text.slice(0, 300) });
      break;
    }
    const payload = (await res.json()) as LsPageMeta & {
      data?: { id?: string; attributes?: { name?: string; code?: string; amount?: number; amount_type?: string } }[];
    };
    const data = payload.data ?? [];
    for (const d of data) {
      const id = d.id;
      if (!id) continue;
      const a = d.attributes ?? {};
      const code = typeof a.code === "string" ? a.code : null;
      const name = typeof a.name === "string" ? a.name : null;
      const isPercent100 = a.amount_type === "percent" && typeof a.amount === "number" && a.amount >= 100;
      const looksFree = /FREE/i.test(code ?? "") || /FREE/i.test(name ?? "");
      if (isPercent100 || looksFree) out.push({ id, code, name });
    }
    const lastPage = payload.meta?.page?.last_page;
    if (data.length === 0 || (lastPage != null && page >= lastPage)) break;
  }
  return out;
}

/**
 * Lists the redemptions for a discount (which order used it, when). Pages until
 * exhausted or `maxPages`.
 */
export async function listDiscountRedemptions(
  discountId: string,
  maxPages = 20,
): Promise<LsDiscountRedemption[]> {
  const out: LsDiscountRedemption[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await lsApi(
      `/discount-redemptions?filter[discount_id]=${encodeURIComponent(discountId)}&page[size]=100&page[number]=${page}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("listDiscountRedemptions: fetch failed", { discountId, status: res.status, text: text.slice(0, 300) });
      break;
    }
    const payload = (await res.json()) as LsPageMeta & {
      data?: { attributes?: { order_id?: number | string; discount_code?: string; created_at?: string } }[];
    };
    const data = payload.data ?? [];
    for (const r of data) {
      const a = r.attributes ?? {};
      out.push({
        lsOrderId: a.order_id != null ? String(a.order_id) : null,
        discountCode: typeof a.discount_code === "string" ? a.discount_code : null,
        createdAt: typeof a.created_at === "string" ? a.created_at : null,
      });
    }
    const lastPage = payload.meta?.page?.last_page;
    if (data.length === 0 || (lastPage != null && page >= lastPage)) break;
  }
  return out;
}
