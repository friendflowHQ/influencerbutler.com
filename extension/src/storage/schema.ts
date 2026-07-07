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
  // The user's own saved list of deal-aggregator URLs for the Deal Sites
  // Harvester, on top of the curated list served from the site.
  dealSources: string[];
  locale: LocaleSetting;
  tools: {
    videoCounts: boolean;
    approved: boolean;
    calculator: boolean;
    storefront: boolean;
    ordersButler: boolean;
    searchOverlay: boolean;
    campaignMatcher: boolean;
    watchlist: boolean;
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

// One ASIN the user is watching for a change. The background poller opens each
// watched product briefly on an alarm, reads its current state, and fires a
// notification when a subscribed condition trips. `last` is the state at the
// previous check, so a change is a diff against it; null until the first check.
export type WatchCondition = "back_in_stock" | "slot_opens" | "price_drop";

export type WatchSnapshot = {
  inStock: boolean | null;
  influencerVideos: number | null;
  priceCents: number | null;
  checkedAt: number;
};

export type WatchItem = {
  asin: string;
  marketplace: string;
  title: string | null;
  addedAt: number;
  notifyOn: WatchCondition[];
  last: WatchSnapshot | null;
};

// A product cannot be watched forever with no ceiling: cap the list so the
// background poller's per-alarm work (one background tab per item, paced) stays
// bounded. Oldest entries are kept; adds past the cap are rejected in the UI.
export const WATCHLIST_CAP = 50;

// Per-nudge delivery state for the re-engagement prompts (join the Facebook
// group on day 1, download the free desktop app on day 3). Each nudge reaches
// the user through two channels: an OS notification (fired by the background on
// an alarm) and an in-page modal (shown by the content script on the next
// Amazon visit). `notifiedAt`/`modalShownAt` make each channel fire at most
// once; `actedAt` (set when the user clicks either one) suppresses the other so
// nobody is nagged twice for the same thing.
export type NudgeState = {
  notifiedAt: number | null;
  modalShownAt: number | null;
  actedAt: number | null;
};

export type NudgesState = {
  fbGroup: NudgeState;
  appDownload: NudgeState;
};

export const DEFAULT_NUDGE_STATE: NudgeState = {
  notifiedAt: null,
  modalShownAt: null,
  actedAt: null,
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
  watchlist: WatchItem[];
  telemetry: { selectorMisses: Record<string, number> };
  // When the extension was first actually used (first content-script run on an
  // Amazon page). Anchors the re-engagement nudge timers; null until first use.
  firstUseAt: number | null;
  nudges: NudgesState;
};

export const DEFAULTS: StorageShape = {
  schemaVersion: 4,
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
    dealSources: [],
    locale: "auto",
    tools: {
      videoCounts: true,
      approved: true,
      calculator: true,
      storefront: true,
      ordersButler: true,
      searchOverlay: true,
      campaignMatcher: true,
      watchlist: true,
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
  watchlist: [],
  telemetry: { selectorMisses: {} },
  firstUseAt: null,
  nudges: {
    fbGroup: { ...DEFAULT_NUDGE_STATE },
    appDownload: { ...DEFAULT_NUDGE_STATE },
  },
};

export function migrate(raw: Partial<StorageShape> | undefined): StorageShape {
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULTS);
  }
  // Future schema bumps switch on raw.schemaVersion here. Merging with defaults
  // also backfills any keys added within a version. v1 -> v2 added the
  // integrations slice; v2 -> v3 added firstUseAt + nudges; v3 -> v4 added the
  // watchlist array plus the searchOverlay/campaignMatcher/watchlist tool flags.
  // Older stored state simply gains its defaults untouched (an existing user's
  // watchlist starts empty and the new tools default on).
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
    nudges: {
      fbGroup: { ...DEFAULT_NUDGE_STATE, ...(raw.nudges?.fbGroup ?? {}) },
      appDownload: { ...DEFAULT_NUDGE_STATE, ...(raw.nudges?.appDownload ?? {}) },
    },
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    schemaVersion: 4,
  };
}
