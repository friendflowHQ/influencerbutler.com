import type { IntegrationAdapter, IntegrationCategory, IntegrationId } from "./types";
import { openaiAdapter } from "./adapters/openai";
import { creatorsApiAdapter } from "./adapters/creators-api";
import { associatesAdapter } from "./adapters/associates";
import { deeplinkAdapters } from "./adapters/deeplink";
import { affiliateNetworkAdapters } from "./adapters/affiliate-network";

// The full set of integration adapters, in the display order the options page
// uses. Grouped by category on screen.
export const ADAPTERS: IntegrationAdapter[] = [
  openaiAdapter,
  creatorsApiAdapter,
  associatesAdapter,
  ...deeplinkAdapters,
  ...affiliateNetworkAdapters,
];

const BY_ID = new Map<string, IntegrationAdapter>(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: string): IntegrationAdapter | undefined {
  return BY_ID.get(id);
}

export const DEEPLINK_PROVIDER_IDS: IntegrationId[] = deeplinkAdapters.map((a) => a.id);

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
