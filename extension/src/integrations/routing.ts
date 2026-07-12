import { getAdapter } from "./registry";
import { canonicalProductUrl, withAffiliateTag } from "./url";
import type { LinkTarget } from "./types";

// Turns a product into the user's affiliate link. Routing applies the correct
// per-country affiliate tag to the product url, then resolves the final link in
// priority order:
//   1. The first participating affiliate network that can mint its own
//      attribution link (Levanta, then Archer) wins outright, because that link
//      already encodes attribution and should not be re-wrapped.
//   2. Otherwise the primary deeplink provider wraps the tagged url.
//   3. Otherwise the plain tagged url is returned.
// Every step falls through on error so a misconfigured provider never blocks a
// working link. Logie/Benable have no minting step, so their attribution still
// flows through the primary deeplink provider (desktop parity).

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
  // Participating affiliate-network ids that can mint their own attribution
  // link, in priority order. Tried before the primary deeplink provider.
  affiliateNetworks?: string[];
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

  if (!config.enabled) return tagged;

  const target: LinkTarget = { asin: input.asin, marketplace: input.marketplace, url, tag };

  // 1. A participating affiliate network that can mint wins outright.
  for (const networkId of config.affiliateNetworks ?? []) {
    const adapter = getAdapter(networkId);
    if (!adapter?.generateLink) continue;
    try {
      const minted = await adapter.generateLink(target, await getProviderCreds(networkId));
      // A network only "wins" when it actually produced a different, tracked
      // link; if it fell back to the tagged url, keep trying the next option.
      if (minted && minted !== tagged) return minted;
    } catch {
      // Fall through to the next network / the primary deeplink provider.
    }
  }

  // 2. The primary deeplink provider wraps the tagged url.
  const providerId = config.primaryDeeplinkProvider;
  if (providerId) {
    const adapter = getAdapter(providerId);
    if (adapter?.generateLink) {
      try {
        return await adapter.generateLink(target, await getProviderCreds(providerId));
      } catch {
        // A misconfigured provider must never block copying a working link.
        return tagged;
      }
    }
  }

  // 3. Plain tagged url.
  return tagged;
}
