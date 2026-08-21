import type { IntegrationAdapter, IntegrationCategory, IntegrationId } from "./types";
import { openaiAdapter } from "./adapters/openai";
import { creatorsApiAdapter } from "./adapters/creators-api";
import { associatesAdapter } from "./adapters/associates";
import { influencerButlerLinkAdapter } from "./adapters/influencerbutler";
import { deeplinkAdapters } from "./adapters/deeplink";
import { affiliateNetworkAdapters } from "./adapters/affiliate-network";
import { walmartLinkAdapters } from "./adapters/walmart-link";

// The full set of integration adapters, in the display order the options page
// uses. Grouped by category on screen. The Influencer Butler branded-link
// provider leads the deeplink group as the recommended, zero-setup option.
export const ADAPTERS: IntegrationAdapter[] = [
  openaiAdapter,
  creatorsApiAdapter,
  associatesAdapter,
  influencerButlerLinkAdapter,
  ...deeplinkAdapters,
  ...affiliateNetworkAdapters,
  ...walmartLinkAdapters,
];

const BY_ID = new Map<string, IntegrationAdapter>(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: string): IntegrationAdapter | undefined {
  return BY_ID.get(id);
}

// Every deeplink-category adapter, in ADAPTERS order, so the options page's
// "Primary deeplink provider" select lists the branded-link option alongside
// the template-based providers.
export const DEEPLINK_PROVIDER_IDS: IntegrationId[] = ADAPTERS.filter(
  (a) => a.category === "deeplink",
).map((a) => a.id);

// Every affiliate-network adapter, in ADAPTERS order. Routing tries these (in
// this order) before the primary deeplink provider, since a network that can
// mint its own attribution link should win over a generic wrapper.
export const AFFILIATE_NETWORK_IDS: IntegrationId[] = ADAPTERS.filter(
  (a) => a.category === "affiliateNetwork",
).map((a) => a.id);

// Every Walmart-link adapter, in ADAPTERS order, for the options page's
// "Walmart affiliate links" select. The user picks exactly one; routing.ts uses
// it as the mint provider for Walmart products.
export const WALMART_LINK_PROVIDER_IDS: IntegrationId[] = ADAPTERS.filter(
  (a) => a.category === "walmartLink",
).map((a) => a.id);

// Every host pattern any adapter may request, deduplicated. Mirrored in
// static/manifest.json optional_host_permissions so runtime requests succeed.
export const ALL_INTEGRATION_HOSTS: string[] = [
  ...new Set(ADAPTERS.flatMap((a) => a.hosts)),
];

export const CATEGORY_ORDER: IntegrationCategory[] = [
  "ai",
  "productData",
  "affiliateTag",
  "deeplink",
  "affiliateNetwork",
  "walmartLink",
];
