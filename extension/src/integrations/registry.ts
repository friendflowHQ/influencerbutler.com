import type { IntegrationAdapter, IntegrationCategory, IntegrationId } from "./types";
import { openaiAdapter } from "./adapters/openai";
import { creatorsApiAdapter } from "./adapters/creators-api";
import { associatesAdapter } from "./adapters/associates";
import { influencerButlerLinkAdapter } from "./adapters/influencerbutler";
import { deeplinkAdapters } from "./adapters/deeplink";
import { affiliateNetworkAdapters } from "./adapters/affiliate-network";

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
];
