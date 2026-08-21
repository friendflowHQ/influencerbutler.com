import type { Finding, VideoCounts } from "../transport/types";
import type { LocaleSetting } from "../i18n";
import type { CreatorMode } from "../shared/creator-mode";
import type { LinkPixel } from "../integrations/ib-links-client";

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
  // User-tunable floors for Campaign Radar's highlight on the Creator
  // Connections grid. This is the differentiator over the competitor's fixed
  // thresholds: a campaign is highlighted only when it clears all three.
  // minRemainingBudget is in dollars, matching approved.minPrice.
  campaignRadar: {
    minCommissionPct: number;
    minDaysRemaining: number;
    minRemainingBudget: number;
  };
  // Last Call Butler: when a watched Creator Connections campaign crosses this
  // fill level (creator slots claimed / cap, as a percent), the background poll
  // fires a "Last Call" notification so the creator can accept before it closes.
  lastCall: {
    alertAtPct: number;
  };
  // Marketplace codes (US/CA/UK/AU) whose buy-box availability Campaign Radar
  // checks per campaign product, rendering per-country chips on the grid.
  // Empty (the default) = feature off, zero extra fetches. Top-level rather
  // than nested under campaignRadar because patchSettings shallow-merges and
  // the radar toolbar patches campaignRadar wholesale on every threshold edit.
  availabilityMarkets: string[];
  storefrontHandle: string | null;
  orderHarvestScope: "new" | "all";
  // Link Butler config for the branded-link Ledger tab. `smartRouting` publishes
  // a routing definition (Passport / Best-Rate / heal) when a link is minted, so
  // browser-minted links route at the edge like desktop-minted ones. `pixels`
  // are the account-wide retargeting pixels (the Doorbell); the worker has no
  // read endpoint, so the list is kept here for the form and POSTed on save.
  linkButler: {
    smartRouting: boolean;
    pixels: LinkPixel[];
  };
  // Creator channel mirrored from the desktop app over the bridge. Drives which
  // on-page tools and popup launchers are shown. Defaults to "both" (show
  // everything) so an install that never connects the app is unfiltered.
  creatorMode: CreatorMode;
  // The user's own saved list of deal-aggregator URLs for the Deal Sites
  // Harvester, on top of the curated list served from the site.
  dealSources: string[];
  locale: LocaleSetting;
  tools: {
    videoCounts: boolean;
    videoLandscape: boolean;
    approved: boolean;
    calculator: boolean;
    storefront: boolean;
    ordersButler: boolean;
    searchOverlay: boolean;
    storeOverlay: boolean;
    trendRadar: boolean;
    globalMaximizer: boolean;
    campaignMatcher: boolean;
    campaignRadar: boolean;
    earningsOverlay: boolean;
    watchlist: boolean;
    lastCallButler: boolean;
    ideaListOverlay: boolean;
    // Campaign Butler: the on-demand "Butler's Brief" panel on Creator
    // Connections campaigns (score + confidence + AI reasoning). Backfilled to
    // true for existing users by the tools shallow-merge in migrate().
    campaignButler: boolean;
    // Video Money: per-row earnings / EPV / live-rate / demand badges plus a
    // reshoot panel on the Creator Hub "Manage videos" list. Backfilled to true
    // for existing users by the tools shallow-merge in migrate().
    videoMoney: boolean;
    // Master gate for all Walmart.com support (the neutral overlays run on
    // Walmart pages when this is on). Lets a user turn Walmart off without
    // touching their Amazon overlays. Backfilled to true by the tools
    // shallow-merge in migrate().
    walmart: boolean;
  };
  syncEnabled: boolean;
  // Opt-in (default OFF): contribute product facts (ASIN, price, best-seller
  // rank, "bought in past month", category, brand) AND de-identified video
  // placement observations (which creator videos hold a product's carousel, and
  // where) the extension already reads, to the shared catalogue, so the whole
  // community sees real demand, price/rank history, and video competition over
  // time. Never personal data. Gated at the transport: when off, none of these
  // are transmitted. Requires syncEnabled + a signed-in key. Widening what this
  // shares is a user-facing disclosure change (see contributeBlurb), not a
  // silent addition, and rides the same pending legal review as the catalogue.
  contributeCatalogue: boolean;
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
  // Masked email for display only (e***@gmail.com). The server never sends the
  // raw address to a license-bearer client. API auth uses licenseKey, not this.
  email: string | null;
  verifiedAt: number | null;
};

// Third-party API integrations (OpenAI, Amazon Creators API, deeplink
// providers, affiliate networks) configured on the options page. Credentials
// are encrypted at rest with AES-GCM (see src/integrations/crypto.ts) and never
// leave the machine: tests and live use call each provider's own API directly.
// The one exception is the Influencer Butler branded-link provider, which is a
// first-party service (links.influencerbutler.com) authenticated with the
// signed-in license key rather than a stored third-party credential. Keyed by
// the adapter id (src/integrations).
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
    // Which Walmart link provider mints Walmart affiliate links ("impact" |
    // "walmartCreator"), or null when the creator has not chosen one yet.
    walmartLinkProvider: string | null;
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

// A single observed price for a product, so the product panel can draw a small
// price-history sparkline and flag an all-time low. Built locally from the
// prices the extension already reads as the creator browses (no extra fetch, no
// server): the record starts empty and grows over time. Keyed by
// `marketplace:asin`; points are kept oldest-first.
export type PricePoint = { at: number; cents: number };

// Bounds so the history can never grow without limit: at most this many points
// per product, and at most this many products tracked (least-recently-seen
// products drop out first).
export const PRICE_HISTORY_POINTS_CAP = 90;
export const PRICE_HISTORY_ASINS_CAP = 300;

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

// One product saved into a user-named list ("Add to List"). Lighter than a
// WatchItem: lists are just curated collections for research/planning, with no
// background polling, so they carry only what a card needs to render + reopen.
export type ProductListItem = {
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  addedAt: number;
};

// A user-named collection of products. `id` is a stable local id (not an ASIN),
// so two lists can hold the same product and a rename never moves items.
export type ProductList = {
  id: string;
  name: string;
  createdAt: number;
  items: ProductListItem[];
};

// Bounds mirroring the watchlist's: enough for real research use without letting
// local storage grow unbounded. Adds past a cap are rejected in the UI.
export const PRODUCT_LISTS_CAP = 30;
export const PRODUCT_LIST_ITEMS_CAP = 200;

// One Creator Connections campaign the creator is watching for Last Call: an
// alert before it fills up. Keyed by the Amazon campaignId. `lastFillPct` and
// `lastFullyClaimed` are the last observed values, so the poll fires the alert
// exactly once when the fill first crosses the user's threshold (or the campaign
// first flips to fully claimed) and stays quiet afterward.
export type CampaignWatchItem = {
  campaignId: string;
  brand: string | null;
  addedAt: number;
  lastFillPct: number | null;
  lastFullyClaimed: boolean | null;
  notifiedAt: number | null;
};

// The campaign watchlist is bounded like the product one. The poll opens the
// grid in a single background tab per cycle regardless of list size, but the cap
// keeps the stored list and the per-campaign diff work sane.
export const CAMPAIGN_WATCHLIST_CAP = 50;

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

// One-time in-page hints. Unlike the nudges above these are not timed and have
// no notification channel: a hint is drawn next to the feature it explains, and
// the first interaction (act or dismiss) stamps the key so it never shows again.
// null means "not settled yet", a timestamp means done.
export type HintsState = {
  // "Copy my link" tip pointing out free branded short links, shown to a
  // signed-in creator who is still copying plain tagged Amazon urls.
  brandedLinks: number | null;
};

export const DEFAULT_HINTS_STATE: HintsState = {
  brandedLinks: null,
};

export type StorageShape = {
  schemaVersion: number;
  settings: Settings;
  auth: AuthState;
  integrations: IntegrationsState;
  queue: Finding[];
  lastSyncAt: number | null;
  cache: Record<string, CachedScan>;
  // Price history per `marketplace:asin`, oldest-first. See PricePoint.
  priceHistory: Record<string, PricePoint[]>;
  orderCursors: Record<string, OrderCursor>;
  watchlist: WatchItem[];
  campaignWatchlist: CampaignWatchItem[];
  // User-named product collections ("Add to List"). Local-only, no server sync.
  productLists: ProductList[];
  telemetry: { selectorMisses: Record<string, number> };
  // When the extension was first actually used (first content-script run on an
  // Amazon page). Anchors the re-engagement nudge timers; null until first use.
  firstUseAt: number | null;
  nudges: NudgesState;
  hints: HintsState;
};

export const DEFAULTS: StorageShape = {
  schemaVersion: 17,
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
    campaignRadar: {
      minCommissionPct: 10,
      minDaysRemaining: 7,
      minRemainingBudget: 1000,
    },
    lastCall: {
      alertAtPct: 90,
    },
    availabilityMarkets: [],
    storefrontHandle: null,
    orderHarvestScope: "new",
    linkButler: { smartRouting: false, pixels: [] },
    creatorMode: "both",
    dealSources: [],
    locale: "auto",
    tools: {
      videoCounts: true,
      videoLandscape: true,
      approved: true,
      calculator: true,
      storefront: true,
      ordersButler: true,
      searchOverlay: true,
      storeOverlay: true,
      trendRadar: true,
      globalMaximizer: true,
      campaignMatcher: true,
      campaignRadar: true,
      earningsOverlay: true,
      watchlist: true,
      lastCallButler: true,
      ideaListOverlay: true,
      campaignButler: true,
      videoMoney: true,
      walmart: true,
    },
    syncEnabled: true,
    contributeCatalogue: false,
    debug: false,
  },
  auth: { licenseKey: null, email: null, verifiedAt: null },
  integrations: {
    global: {
      testOnStartup: false,
      affiliateRoutingEnabled: false,
      // Branded short links out of the box: free on every plan, no credentials
      // (the signed-in license is the auth), and it keeps the creator's
      // affiliate tag out of the url they post. This default reaches FRESH
      // INSTALLS ONLY. migrate() spreads stored global state over these
      // defaults, and any patchState writes the whole blob back, so an existing
      // install has `primaryDeeplinkProvider: null` stored explicitly and keeps
      // it. Existing users are reached by the one-time hint in the "My link"
      // panel instead, which asks rather than deciding for them.
      primaryDeeplinkProvider: "influencerbutler",
      // No Walmart provider until the creator connects one (fresh installs and
      // existing users alike start null; the global shallow-merge backfills it).
      walmartLinkProvider: null,
      perCountryTags: {},
    },
    providers: {},
  },
  queue: [],
  lastSyncAt: null,
  cache: {},
  priceHistory: {},
  orderCursors: {},
  watchlist: [],
  campaignWatchlist: [],
  productLists: [],
  telemetry: { selectorMisses: {} },
  firstUseAt: null,
  nudges: {
    fbGroup: { ...DEFAULT_NUDGE_STATE },
    appDownload: { ...DEFAULT_NUDGE_STATE },
  },
  hints: { ...DEFAULT_HINTS_STATE },
};

export function migrate(raw: Partial<StorageShape> | undefined): StorageShape {
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULTS);
  }
  // Future schema bumps switch on raw.schemaVersion here. Merging with defaults
  // also backfills any keys added within a version. v1 -> v2 added the
  // integrations slice; v2 -> v3 added firstUseAt + nudges; v3 -> v4 added the
  // watchlist array plus the searchOverlay/campaignMatcher/watchlist tool flags;
  // v4 -> v5 added the priceHistory map; v5 -> v6 added the campaignRadar
  // thresholds plus the campaignRadar tool flag; v6 -> v7 added
  // settings.creatorMode (defaults to "both", so existing users stay
  // unfiltered until the app reports their channel); v7 -> v8 added
  // settings.linkButler (smart-routing off, no pixels); v8 -> v9 added the
  // storeOverlay tool flag (brand-store research overlay, on by default);
  // v9 -> v10 added the trendRadar tool flag (Best Sellers / New Releases /
  // Movers & Shakers discovery overlay) and the globalMaximizer tool flag
  // (per-market availability + international links), both on by default.
  // v10 -> v11 added Last Call Butler (the lastCallButler tool flag, on by
  // default, the settings.lastCall.alertAtPct threshold at 90%, and the empty
  // campaignWatchlist array) plus the `hints` map (one-time in-page tips); an
  // existing user starts with every hint unseen, so the branded-links tip
  // reaches people who installed before it existed, which is the whole point
  // of it. Older stored state simply gains its defaults untouched (an
  // existing user's price history starts empty). v11 -> v12 added the
  // ideaListOverlay tool flag (money signals on Idea List detail pages, on
  // by default); the tools shallow-merge backfills it. v12 -> v13 added
  // settings.contributeCatalogue (shared product-catalogue contribution,
  // OFF by default); the settings shallow-merge backfills it, so every
  // existing user stays opted OUT until they turn it on. v13 -> v14 added the
  // productLists array ("Add to List" collections); an existing user starts
  // with no lists, reconciled below like the watchlist. v14 -> v15 added the
  // videoLandscape tool flag (aggregate video-intelligence panel on product
  // pages, on by default); the tools shallow-merge backfills it. v15 -> v16
  // added the videoMoney tool flag (per-row money signals + reshoot panel on
  // the Creator Hub "Manage videos" list, on by default); the tools
  // shallow-merge backfills it. v16 -> v17 added Walmart.com support: the
  // tools.walmart master gate (on by default, backfilled by the tools
  // shallow-merge) and integrations.global.walmartLinkProvider (null until the
  // creator connects Impact or Walmart Creator, backfilled by the global
  // shallow-merge).
  return {
    ...structuredClone(DEFAULTS),
    ...raw,
    settings: {
      ...structuredClone(DEFAULTS.settings),
      ...(raw.settings ?? {}),
      approved: { ...DEFAULTS.settings.approved, ...(raw.settings?.approved ?? {}) },
      campaignRadar: {
        ...DEFAULTS.settings.campaignRadar,
        ...(raw.settings?.campaignRadar ?? {}),
      },
      lastCall: {
        ...DEFAULTS.settings.lastCall,
        ...(raw.settings?.lastCall ?? {}),
      },
      linkButler: {
        ...structuredClone(DEFAULTS.settings.linkButler),
        ...(raw.settings?.linkButler ?? {}),
        pixels: Array.isArray(raw.settings?.linkButler?.pixels)
          ? raw.settings.linkButler.pixels
          : [],
      },
      tools: { ...DEFAULTS.settings.tools, ...(raw.settings?.tools ?? {}) },
      availabilityMarkets: Array.isArray(raw.settings?.availabilityMarkets)
        ? raw.settings.availabilityMarkets
        : [],
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
    hints: { ...DEFAULT_HINTS_STATE, ...(raw.hints ?? {}) },
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    campaignWatchlist: Array.isArray(raw.campaignWatchlist) ? raw.campaignWatchlist : [],
    productLists: Array.isArray(raw.productLists) ? raw.productLists : [],
    priceHistory:
      raw.priceHistory && typeof raw.priceHistory === "object" ? raw.priceHistory : {},
    schemaVersion: 17,
  };
}
