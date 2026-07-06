import { getAdapter } from "./registry";
import { canonicalProductUrl, withAffiliateTag } from "./url";
import type { LinkTarget } from "./types";

// Turns a product into the user's affiliate link. MVP routing = the correct
// per-country affiliate tag applied to the product url, then wrapped through the
// primary deeplink provider when one is set. Levanta/Archer/Logie attribution
// also flows through that same primary deeplink provider (desktop parity).
//
// Phase 2 (documented in the plan): when multiple networks cover an ASIN,
// pick the highest-commission provider by consulting the cached rate card in
// src/rate-card. Until then routing is deterministic: tag + primary deeplink.

// Amazon marketplace domain (as produced by marketplaceFromUrl) -> country code
// used as the key in integrations.global.perCountryTags.
const MARKETPLACE_COUNTRY: Record<string, string> = {
  "amazon.com": "US",
  "amazon.ca": "CA",
  "amazon.com.mx": "MX",
  "amazon.com.br": "BR",
  "amazon.co.uk": "UK",
  "amazon.de": "DE",
  "amazon.fr": "FR",
  "amazon.it": "IT",
  "amazon.es": "ES",
  "amazon.nl": "NL",
  "amazon.se": "SE",
  "amazon.pl": "PL",
  "amazon.com.tr": "TR",
  "amazon.ae": "AE",
  "amazon.sa": "SA",
  "amazon.in": "IN",
  "amazon.co.jp": "JP",
  "amazon.com.au": "AU",
  "amazon.sg": "SG",
};

export function countryFor(marketplace: string): string {
  return MARKETPLACE_COUNTRY[marketplace] ?? "US";
}

// The tag to use for a marketplace. The US tag falls back to the creator's
// storefront handle when no explicit tag is set, matching the desktop app.
export function resolveTag(
  marketplace: string,
  perCountryTags: Record<string, string>,
  storefrontHandle: string | null,
): string | undefined {
  const country = countryFor(marketplace);
  const explicit = (perCountryTags[country] ?? "").trim();
  if (explicit) return explicit;
  if (country === "US" && storefrontHandle) return storefrontHandle.trim() || undefined;
  return undefined;
}

export type RoutingConfig = {
  enabled: boolean;
  primaryDeeplinkProvider: string | null;
  perCountryTags: Record<string, string>;
  storefrontHandle: string | null;
};

export type BuildLinkInput = { asin: string; marketplace: string; url?: string };

// Resolve the final link. `getProviderCreds` decrypts a provider's stored
// credentials (injected so this module stays free of storage/crypto deps).
export async function buildAffiliateLink(
  input: BuildLinkInput,
  config: RoutingConfig,
  getProviderCreds: (id: string) => Promise<Record<string, string>>,
): Promise<string> {
  const url = input.url || canonicalProductUrl(input.asin, input.marketplace, input.url ?? "");
  const tag = config.enabled
    ? resolveTag(input.marketplace, config.perCountryTags, config.storefrontHandle)
    : undefined;

  const tagged = tag ? withAffiliateTag(url, tag) : url;

  const providerId = config.primaryDeeplinkProvider;
  if (!config.enabled || !providerId) return tagged;

  const adapter = getAdapter(providerId);
  if (!adapter?.generateLink) return tagged;

  const target: LinkTarget = { asin: input.asin, marketplace: input.marketplace, url, tag };
  try {
    return await adapter.generateLink(target, await getProviderCreds(providerId));
  } catch {
    // A misconfigured provider must never block copying a working link.
    return tagged;
  }
}
