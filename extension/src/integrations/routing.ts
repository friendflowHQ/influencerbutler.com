import { getAdapter } from "./registry";
import { canonicalProductUrl, withAffiliateTag } from "./url";
import { withAppOpenParams } from "./app-link";
import { noticeOf, type LinkNotice } from "./link-notice";
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
// working link. Benable has no minting step, so its attribution still flows
// through the primary deeplink provider (desktop parity).

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
//
// This resolves ONLY the user's own Associates link tag (perCountryTags /
// storefrontHandle). It deliberately never falls back to the Creator API
// partner tag: that tag (including Influencer Butler's backup partner tag) is
// for product-data lookups only and must never be stamped onto a link the user
// shares. When the user has no tag of their own, this returns undefined and the
// link is left untagged rather than borrowing the product-data tag.
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
  // The chosen Walmart link provider ("walmartCreator" | "mavely"), used for
  // Walmart products. Amazon products ignore it.
  walmartLinkProvider?: string | null;
  perCountryTags: Record<string, string>;
  storefrontHandle: string | null;
  // When true, compare providers by commission rate and pick the highest for
  // this product (tie-broken by the affiliateNetworks priority order, then
  // Amazon). When false or unset, routing uses the fixed priority order above.
  useHighestCommission?: boolean;
  // The Amazon Associates commission rate (percent) for this product, resolved
  // by the caller from the rate card / a caller-supplied hint, or null when
  // unknown. Only consulted under useHighestCommission. The routing module stays
  // storage-free, so the rate is injected rather than looked up here.
  amazonRatePct?: number | null;
  // Whether the Amazon baseline competes in highest-commission routing (the
  // "amazon" roster row). Networks are already gated by affiliateNetworks.
  amazonParticipates?: boolean;
  // When true, Amazon links carry the SiteStripe app-opening params
  // (linkCode=ssc + creativeASIN) so they open the Amazon app on phones. Every
  // wrapper (deeplink providers, branded links) points at that same url. Off
  // when unset so callers opt in explicitly from the stored setting.
  appOpeningLinks?: boolean;
};

// One provider's candidate link under highest-commission routing. `rate` is the
// commission percentage, or null when the provider does not report one.
type RateCandidate = { provider: string; url: string; rate: number | null };

// Pick the highest-rate candidate, tie-broken by `priority` order (a null rate
// sorts last, so a provider with no known rate only wins on priority when no
// candidate reports a rate). Mirrors the desktop router's pickWinner.
function pickWinner(candidates: RateCandidate[], priority: string[]): RateCandidate | null {
  const ranked = candidates.filter((c) => c.url);
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => {
    const ra = a.rate ?? -Infinity;
    const rb = b.rate ?? -Infinity;
    if (rb !== ra) return rb - ra;
    const pa = priority.indexOf(a.provider);
    const pb = priority.indexOf(b.provider);
    return (pa === -1 ? Number.MAX_SAFE_INTEGER : pa) - (pb === -1 ? Number.MAX_SAFE_INTEGER : pb);
  });
  return ranked[0] ?? null;
}

export type BuildLinkInput = {
  asin: string;
  marketplace: string;
  url?: string;
  retailer?: "amazon" | "walmart";
};

// The resolved link, plus (when there is one) the reason it is not the link the
// user's setup asked for. `url` is always usable; `notice` exists only so the UI
// can explain a fallback instead of leaving the user to guess. See link-notice.
export type BuildLinkResult = { url: string; notice?: LinkNotice };

// Resolve the final link. `getProviderCreds` decrypts a provider's stored
// credentials (injected so this module stays free of storage/crypto deps).
export async function buildAffiliateLink(
  input: BuildLinkInput,
  config: RoutingConfig,
  getProviderCreds: (id: string) => Promise<Record<string, string>>,
): Promise<BuildLinkResult> {
  const retailer = input.retailer ?? "amazon";

  // Walmart runs entirely through its own link provider (Walmart Creator /
  // Mavely): no per-country Associates tag, no deeplink wrapper. Mint via the
  // chosen provider, falling back to the plain /ip/ url on any failure.
  if (retailer === "walmart") {
    const wmUrl =
      input.url || canonicalProductUrl(input.asin, input.marketplace, input.url ?? "", "walmart");
    const providerId = config.enabled ? config.walmartLinkProvider : null;
    if (!providerId) return { url: wmUrl };
    const adapter = getAdapter(providerId);
    if (!adapter?.generateLink) return { url: wmUrl };
    const target: LinkTarget = {
      asin: input.asin,
      marketplace: input.marketplace,
      url: wmUrl,
      retailer: "walmart",
    };
    try {
      const minted = await adapter.generateLink(target, await getProviderCreds(providerId));
      return { url: minted || wmUrl };
    } catch (error) {
      return { url: wmUrl, notice: noticeOf(error) };
    }
  }

  const url = input.url || canonicalProductUrl(input.asin, input.marketplace, input.url ?? "");
  const tag = config.enabled
    ? resolveTag(input.marketplace, config.perCountryTags, config.storefrontHandle)
    : undefined;

  // The single Amazon link assembly point: tag, then (setting on) the
  // app-opening params. Adapters rebuild the same url via taggedUrlFor from the
  // target below, so `appOpen` rides along on the target.
  const appOpen = config.appOpeningLinks === true;
  const taggedBase = tag ? withAffiliateTag(url, tag) : url;
  const tagged = appOpen ? withAppOpenParams(taggedBase, input.asin) : taggedBase;

  if (!config.enabled) return { url: tagged };

  const target: LinkTarget = { asin: input.asin, marketplace: input.marketplace, url, tag, appOpen };

  // 0. Highest-commission routing: gather each connected provider's link and
  // rate, then pick the best-paying one for this product. A network's minted
  // link already encodes attribution, so a network winner is returned as-is; an
  // Amazon winner is still wrapped through the primary deeplink provider (the
  // rate is the same either way, and the wrap keeps the tag out of the url).
  if (config.useHighestCommission) {
    const candidates: RateCandidate[] = [];
    if (config.amazonParticipates !== false) {
      candidates.push({ provider: "amazon", url: tagged, rate: config.amazonRatePct ?? null });
    }
    for (const networkId of config.affiliateNetworks ?? []) {
      const adapter = getAdapter(networkId);
      if (!adapter?.generateLink) continue;
      try {
        const creds = await getProviderCreds(networkId);
        const minted = await adapter.generateLink(target, creds);
        if (!minted || minted === tagged) continue;
        let rate: number | null = null;
        if (adapter.estimateRate) {
          try {
            rate = await adapter.estimateRate(target, creds);
          } catch {
            rate = null;
          }
        }
        candidates.push({ provider: networkId, url: minted, rate });
      } catch {
        // A failed provider simply does not compete.
      }
    }
    const winner = pickWinner(candidates, [...(config.affiliateNetworks ?? []), "amazon"]);
    if (winner) {
      if (winner.provider === "amazon" && config.primaryDeeplinkProvider) {
        const dp = getAdapter(config.primaryDeeplinkProvider);
        if (dp?.generateLink) {
          try {
            return { url: await dp.generateLink(target, await getProviderCreds(config.primaryDeeplinkProvider)) };
          } catch (error) {
            return { url: winner.url, notice: noticeOf(error) };
          }
        }
      }
      return { url: winner.url };
    }
    // Nothing produced a usable link: fall through to the plain tagged url.
    return { url: tagged };
  }

  // 1. A participating affiliate network that can mint wins outright.
  for (const networkId of config.affiliateNetworks ?? []) {
    const adapter = getAdapter(networkId);
    if (!adapter?.generateLink) continue;
    try {
      const minted = await adapter.generateLink(target, await getProviderCreds(networkId));
      // A network only "wins" when it actually produced a different, tracked
      // link; if it fell back to the tagged url, keep trying the next option.
      if (minted && minted !== tagged) return { url: minted };
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
        return { url: await adapter.generateLink(target, await getProviderCreds(providerId)) };
      } catch (error) {
        // A misconfigured provider must never block copying a working link. Some
        // fallbacks carry a reason worth showing the user (see link-notice); the
        // rest fall back just as silently as before.
        return { url: tagged, notice: noticeOf(error) };
      }
    }
  }

  // 3. Plain tagged url.
  return { url: tagged };
}
