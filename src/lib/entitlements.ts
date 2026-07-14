/**
 * Entitlements: the single source of truth for what each tier unlocks.
 *
 * The product has three tiers:
 *   - free  : the whole Chrome extension (anonymous, no login) plus the
 *             "See & Organize" desktop butlers. These stay on regardless of
 *             subscription status - including trials that expired and
 *             subscriptions that were cancelled.
 *   - trial : the full-Pro 3-day tryout. Everything unlocked, then converts.
 *   - pro   : Solo / Team / Agency. Everything unlocked, multi-device, support.
 *
 * Site copy (pricing page, feature catalog), the /api/entitlements endpoint,
 * and the desktop app spec (docs/entitlements-spec.md) all read from here so
 * "what is free" can never drift between the three.
 */

export type EntitlementTier = "free" | "trial" | "pro";

/**
 * The desktop butlers that are free forever, keyed by their feature-catalog
 * slug (see src/lib/mcp/feature-catalog.ts). These run on any account state:
 * trial, paid, expired, or cancelled.
 *
 * The wedge: free tools let a creator SEE and organize (import order history,
 * grab ASINs, audit a storefront, auto-like at a safe pace). The Pro butlers
 * ACT at scale (outreach, DMs, commission harvesting). Free builds the daily
 * habit and the data lock-in; Pro is where the money engines live.
 */
export const FREE_BUTLER_SLUGS = [
  "like-butler",
  "benable-like-butler",
  "instagram-like-butler",
  "cc-check",
  "orders-butler",
  "storefront-butler",
] as const;

export type FreeButlerSlug = (typeof FREE_BUTLER_SLUGS)[number];

const FREE_SLUG_SET: ReadonlySet<string> = new Set(FREE_BUTLER_SLUGS);

/** True when a butler (by feature-catalog slug) is free on every account. */
export function isFreeButler(slug: string): boolean {
  return FREE_SLUG_SET.has(slug);
}

/**
 * The tier a butler belongs to for marketing badges. Free butlers are "free";
 * everything else is "pro" (available on trial and Pro).
 */
export function butlerTier(slug: string): "free" | "pro" {
  return isFreeButler(slug) ? "free" : "pro";
}

/**
 * Does this tier unlock every butler? Trial and Pro do; Free only unlocks the
 * free set. Callers that gate a specific butler should combine this with
 * isFreeButler() so the free butlers stay on even for the free tier.
 */
export function tierUnlocksAll(tier: EntitlementTier): boolean {
  return tier === "trial" || tier === "pro";
}

/**
 * Whether a given tier can run a given butler. Free tier: only the free set.
 * Trial / Pro: everything.
 */
export function tierUnlocks(tier: EntitlementTier, slug: string): boolean {
  return tierUnlocksAll(tier) || isFreeButler(slug);
}

/**
 * Shape returned by GET /api/entitlements. The desktop app reads this to
 * decide which butlers to keep enabled. When no active subscription resolves,
 * the API still returns tier:"free" (never a hard 401) so the free butlers
 * keep working for lapsed users.
 */
export type EntitlementsResponse = {
  tier: EntitlementTier;
  /** Underlying subscription status when known (on_trial, active, cancelled, ...). */
  status: string | null;
  /** Trial and Pro unlock everything; Free unlocks only freeButlerSlugs. */
  allButlersUnlocked: boolean;
  /** The free-forever butler slugs, always present so the app can gate safely. */
  freeButlerSlugs: readonly string[];
};

/** Build the entitlements payload from a resolved tier + raw status. */
export function entitlementsFor(
  tier: EntitlementTier,
  status: string | null,
): EntitlementsResponse {
  return {
    tier,
    status,
    allButlersUnlocked: tierUnlocksAll(tier),
    freeButlerSlugs: FREE_BUTLER_SLUGS,
  };
}

/**
 * Map a subscription status string (from the subscriptions table / Lemon
 * Squeezy) to an entitlement tier. Anything that is not an active trial or an
 * active paid subscription falls back to the free tier - the free butlers keep
 * working, everything else prompts an upgrade.
 */
export function tierForSubscriptionStatus(
  status: string | null | undefined,
): EntitlementTier {
  if (status === "on_trial") return "trial";
  if (status === "active" || status === "past_due" || status === "paused") {
    // past_due / paused still count as Pro until the subscription is fully
    // cancelled; billing recovery is handled separately by the LS webhook.
    return "pro";
  }
  return "free";
}
