import type { Finding, VideoCounts } from "../transport/types";
import type { LocaleSetting } from "../i18n";

// Everything lives in chrome.storage.local. The license key deliberately
// never goes to storage.sync so it cannot leave the machine via Chrome sync.

export type Settings = {
  commissionRatePct: number;
  categoryKey: string;
  hourlyValue: number;
  minutesPerVideo: number;
  conversionPct: number;
  contentGapThreshold: number;
  approved: {
    minBoughtPerMonth: number;
    maxInfluencerVideos: number;
    minPrice: number;
  };
  storefrontHandle: string | null;
  orderHarvestScope: "new" | "all";
  locale: LocaleSetting;
  tools: {
    videoCounts: boolean;
    approved: boolean;
    calculator: boolean;
    storefront: boolean;
    ordersButler: boolean;
  };
  syncEnabled: boolean;
  debug: boolean;
};

// Where a marketplace's incremental harvest last stopped. "Only new since
// last run" walks newest-first and halts at lastOrderId, so ongoing syncs
// finish in seconds instead of re-walking the whole history.
export type OrderCursor = {
  lastOrderId: string;
  lastHarvestAt: number;
};

export type AuthState = {
  licenseKey: string | null;
  email: string | null;
  verifiedAt: number | null;
};

// Third-party API integrations (OpenAI, Amazon Creators API, deeplink
// providers, affiliate networks) configured on the options page. Credentials
// are encrypted at rest with AES-GCM (see src/integrations/crypto.ts) and never
// leave the machine: tests and live use call each provider's own API directly,
// never influencerbutler.com. Keyed by the adapter id (src/integrations).
export type EncryptedBlob = { iv: string; ct: string };

export type IntegrationTestStatus = "untested" | "ok" | "fail";

export type IntegrationTestResult = {
  status: IntegrationTestStatus;
  at: number | null;
  message: string | null;
};

export type IntegrationState = {
  enabled: boolean;
  // Encrypted JSON of the provider's credential fields (Record<string,string>),
  // or null when nothing has been saved yet.
  credentialsEnc: EncryptedBlob | null;
  lastTest: IntegrationTestResult;
  // Whether this provider takes part in affiliate routing when connected.
  routingParticipates: boolean;
};

export type IntegrationsState = {
  global: {
    // Run every saved test on browser startup (adds a few seconds; off by default).
    testOnStartup: boolean;
    // Master switch for rewriting Amazon links through connected providers.
    affiliateRoutingEnabled: boolean;
    // Which deeplink provider wraps generated links (adapter id), or null.
    primaryDeeplinkProvider: string | null;
    // Amazon Associates tag per marketplace country code, for example
    // { US: "mytag-20", UK: "mytag-21" }. US defaults to the storefront handle.
    perCountryTags: Record<string, string>;
  };
  providers: Record<string, IntegrationState>;
};

export const DEFAULT_INTEGRATION_STATE: IntegrationState = {
  enabled: false,
  credentialsEnc: null,
  lastTest: { status: "untested", at: null, message: null },
  routingParticipates: true,
};

export type CachedScan = {
  counts: VideoCounts;
  title?: string;
  inStock: boolean;
  ts: number;
};

export type StorageShape = {
  schemaVersion: number;
  settings: Settings;
  auth: AuthState;
  integrations: IntegrationsState;
  queue: Finding[];
  lastSyncAt: number | null;
  cache: Record<string, CachedScan>;
  orderCursors: Record<string, OrderCursor>;
  telemetry: { selectorMisses: Record<string, number> };
};

export const DEFAULTS: StorageShape = {
  schemaVersion: 2,
  settings: {
    commissionRatePct: 2.5,
    categoryKey: "default",
    hourlyValue: 25,
    minutesPerVideo: 60,
    conversionPct: 2,
    contentGapThreshold: 2,
    approved: {
      minBoughtPerMonth: 50,
      maxInfluencerVideos: 5,
      minPrice: 20,
    },
    storefrontHandle: null,
    orderHarvestScope: "new",
    locale: "auto",
    tools: {
      videoCounts: true,
      approved: true,
      calculator: true,
      storefront: true,
      ordersButler: true,
    },
    syncEnabled: true,
    debug: false,
  },
  auth: { licenseKey: null, email: null, verifiedAt: null },
  integrations: {
    global: {
      testOnStartup: false,
      affiliateRoutingEnabled: false,
      primaryDeeplinkProvider: null,
      perCountryTags: {},
    },
    providers: {},
  },
  queue: [],
  lastSyncAt: null,
  cache: {},
  orderCursors: {},
  telemetry: { selectorMisses: {} },
};

export function migrate(raw: Partial<StorageShape> | undefined): StorageShape {
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULTS);
  }
  // Future schema bumps switch on raw.schemaVersion here. Merging with defaults
  // also backfills any keys added within a version. v1 -> v2 added the
  // integrations slice; older stored state simply gains its defaults untouched.
  return {
    ...structuredClone(DEFAULTS),
    ...raw,
    settings: {
      ...structuredClone(DEFAULTS.settings),
      ...(raw.settings ?? {}),
      approved: { ...DEFAULTS.settings.approved, ...(raw.settings?.approved ?? {}) },
      tools: { ...DEFAULTS.settings.tools, ...(raw.settings?.tools ?? {}) },
    },
    auth: { ...DEFAULTS.auth, ...(raw.auth ?? {}) },
    integrations: {
      global: {
        ...structuredClone(DEFAULTS.integrations.global),
        ...(raw.integrations?.global ?? {}),
        perCountryTags: { ...(raw.integrations?.global?.perCountryTags ?? {}) },
      },
      providers: { ...(raw.integrations?.providers ?? {}) },
    },
    telemetry: { selectorMisses: { ...(raw.telemetry?.selectorMisses ?? {}) } },
    schemaVersion: 2,
  };
}
