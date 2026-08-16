import type { Finding, VideoCounts } from "../transport/types";
import type { CampaignFill } from "../amazon/creator-campaigns";
import type { HarvestedDeal } from "../tools/deal-harvester/extract";
import type {
  AsinEarnings,
  EarningsLookupResult,
  HudCommand,
  HudCommandResult,
  HudStatus,
  PairResult,
} from "../transport/hud-commands";
import type {
  IntegrationsState,
  IntegrationTestResult,
  PricePoint,
  WatchCondition,
  WatchItem,
} from "../storage/schema";
import type {
  LinkPixel,
  LinkStatsRange,
  LinkTrafficFilter,
  ListResult,
  PixelsResult,
  RepointResult,
  StatsResult,
} from "../integrations/ib-links-client";
import type { BrandedMintInput, BulkMintResult } from "../background/links";

type IntegrationsGlobal = IntegrationsState["global"];

// Typed chrome.runtime message contracts. Content scripts and the popup talk
// to the background through these; content scripts never call the network
// for influencerbutler.com themselves.

export type AuthStatus = {
  signedIn: boolean;
  email: string | null;
  queueDepth: number;
  lastSyncAt: number | null;
};

export type PageStatus = {
  pageType:
    | "product"
    | "order-history"
    | "storefront"
    | "brand-store"
    | "creator-upload"
    | "campaign-grid"
    | "search"
    | "discovery"
    | "other";
  toolSummaries: Array<{ label: string; value: string }>;
};

export type RuntimeMessage =
  | { kind: "RECORD_FINDING"; finding: Finding }
  | { kind: "GET_AUTH_STATUS" }
  | { kind: "SIGN_IN"; licenseKey: string }
  | { kind: "SIGN_OUT" }
  | { kind: "FLUSH_QUEUE" }
  | { kind: "GET_PAGE_STATUS" }
  | { kind: "GET_HUD_STATUS"; force?: boolean }
  | { kind: "SEND_HUD_COMMAND"; command: HudCommand }
  // Ask the running desktop app what the creator earned on a batch of ASINs, so
  // product pages and search tiles can show real earnings. Routed to the app
  // over the local bridge; returns paired:false when the app was never connected.
  | { kind: "LOOKUP_EARNINGS"; asins: string[] }
  // Read the locally-built price history for a product, for the sparkline on the
  // product panel. Returns points oldest-first (may be empty on a fresh install).
  | { kind: "GET_PRICE_HISTORY"; asin: string; marketplace: string }
  // Ask the running desktop app for an ASIN's full price/rank history from its
  // durable time-series (deeper than the local capped store). Routed over the
  // local bridge; returns paired:false when the app was never connected.
  | { kind: "GET_DESKTOP_HISTORY"; asin: string }
  // Desktop-app pairing, driven from the popup: ask the app to show a 6-digit
  // code, submit the code the user typed, or forget the stored token.
  | { kind: "REQUEST_PAIRING" }
  | { kind: "SUBMIT_PAIRING_CODE"; code: string }
  | { kind: "UNPAIR_APP" }
  | { kind: "SEND_FEEDBACK"; feedback: FeedbackInput }
  | { kind: "OPEN_URL"; url: string }
  // Opens the extension's options/settings page. Content scripts cannot call
  // chrome.runtime.openOptionsPage directly, so the on-page gear routes here.
  | { kind: "OPEN_OPTIONS" }
  // Records first actual use so the background can schedule the re-engagement
  // nudge alarms. Idempotent: only the first one sets the clock.
  | { kind: "MARK_FIRST_USE" }
  // API integrations (options page + on-page link/AI use). Credentials never
  // ride these messages back to the UI; only non-secret field values do.
  | { kind: "GET_INTEGRATIONS" }
  | {
      kind: "SAVE_INTEGRATION";
      id: string;
      values: Record<string, string>;
      enabled?: boolean;
      routingParticipates?: boolean;
    }
  | { kind: "SET_INTEGRATION_GLOBAL"; partial: Partial<IntegrationsGlobal> }
  | { kind: "TEST_INTEGRATION"; id: string }
  | { kind: "TEST_ALL_INTEGRATIONS" }
  | { kind: "GENERATE_AFFILIATE_LINK"; asin: string; marketplace: string; url?: string }
  | { kind: "REWRITE_LINK"; url: string }
  | { kind: "OPENAI_COMPLETE"; prompt: string }
  | { kind: "AI_CHAT"; messages: AiChatTurn[] }
  // AI concierge voice: mint an ephemeral Realtime token, run a Realtime tool
  // call server-side, and save the transcript. Bearer-authed in the background.
  | { kind: "VOICE_SESSION" }
  | { kind: "VOICE_TOOL"; name: string; args: Record<string, unknown> }
  | { kind: "VOICE_TRANSCRIPT"; sessionId: string | null; transcript: string; startedAt: number | null }
  // Per-country availability for a tagged product, checked from the worker
  // (cross-marketplace fetch needs the host_permissions CORS bypass).
  | { kind: "FETCH_MARKET_AVAILABILITY"; asin: string; markets: string[] }
  // Orders Butler "update influencer video count": the order-history content
  // script asks the worker to open one product in a background tab so its
  // client-side video breakdown hydrates and the page emits a product_scan.
  // The worker waits for that scan (or times out), closes the tab, and returns
  // the counts. Only the background can drive chrome.tabs, so the loop lives in
  // the content script and each product is one short request that keeps the
  // worker awake.
  | { kind: "SCAN_ASIN_IN_TAB"; asin: string; marketplace: string }
  // The list of unique products to run that count over: the account's synced
  // order history, read from /api/extension/orders with the license key.
  | { kind: "GET_ORDER_ASINS" }
  // Creator API (PA-API) enrichment for the storefront checkup. The worker
  // POSTs a batch of ASINs (<=10) to /api/extension/enrich with the license
  // key so the content script never handles the secret. `marketplaces` filters
  // to the storefront's own marketplace so each ASIN comes back as one row.
  | { kind: "ENRICH_PRODUCTS"; asins: string[]; marketplaces?: string[] }
  // ASIN watchlist: add/remove a product and read the current list. The
  // background poller checks each on an alarm and notifies on a change.
  | { kind: "ADD_TO_WATCHLIST"; item: WatchInput }
  | { kind: "REMOVE_FROM_WATCHLIST"; asin: string; marketplace: string }
  | { kind: "SET_WATCH_CONDITIONS"; asin: string; marketplace: string; notifyOn: WatchCondition[] }
  | { kind: "GET_WATCHLIST" }
  | { kind: "IS_WATCHED"; asin: string; marketplace: string }
  // Last Call Butler campaign watchlist: watch/unwatch a Creator Connections
  // campaign (keyed by campaignId) and read the set of watched ids so the grid
  // overlay can show which cards the Butler is watching. The background poll then
  // alerts before a watched campaign fills up.
  | { kind: "CAMPAIGN_WATCH_ADD"; item: CampaignWatchInput }
  | { kind: "CAMPAIGN_WATCH_REMOVE"; campaignId: string }
  | { kind: "CAMPAIGN_WATCH_LIST" }
  // The grid content script forwards the fill map it captured from the
  // campaign/search API (via the MAIN-world connect-hook) so the background can
  // evaluate Last Call watches. Fired both when the creator browses the grid and
  // when the background poll opens it in a tab; the background correlates the
  // poll's tab by sender id.
  | { kind: "REPORT_CAMPAIGN_FILLS"; fills: Record<string, CampaignFill> }
  // Deal Sites Harvester: fetch and parse a list of aggregator URLs (the deals
  // page requests the host permission first), and read the curated source list.
  | { kind: "HARVEST_DEAL_SITES"; urls: string[] }
  | { kind: "GET_DEAL_SOURCES"; force?: boolean }
  // Instagram Goldmine (self-hosted build only): fetch a creator's bio-link
  // site cross-origin from the worker (content scripts on instagram.com cannot)
  // and return the first email found on it. The Goldmine page requests the
  // needed host permission before the run.
  | { kind: "IG_FETCH_BIO_LINK"; url: string }
  // Link Butler Ledger tab. All license-authed calls to the branded-link worker
  // run in the background so the license key never reaches the page. Bulk mint
  // creates a branded link per harvested product; stats/list/repoint/pixels back
  // the analytics, registry, self-heal, and Doorbell surfaces respectively.
  | { kind: "LINK_MINT_BULK"; targets: BrandedMintInput[] }
  | { kind: "LINK_STATS"; range: LinkStatsRange; slug?: string; traffic?: LinkTrafficFilter }
  | { kind: "LINK_LIST"; cursor?: string | null }
  | { kind: "LINK_REPOINT"; slug: string; url: string; asin?: string; marketplace?: string }
  | { kind: "LINK_PIXELS_GET" }
  | { kind: "LINK_PIXELS_SAVE"; pixels: LinkPixel[] }
  // Extension self-update banner: read what Chrome has staged, snooze the
  // banner, or apply the pending update now (restarts the extension, so the
  // caller fires and forgets).
  | { kind: "GET_UPDATE_STATE" }
  | { kind: "UPDATE_REMIND_LATER" }
  | { kind: "APPLY_UPDATE" };

export type IgBioLinkResult = { email: string | null };

export type FeedbackInput = {
  feedbackType: "bug" | "feature" | "praise" | "other";
  message: string;
  pageUrl?: string;
};

export type FeedbackResult = { ok: boolean; error?: string };

export type SignInResult = { ok: boolean; email?: string; error?: string };

// What the options page renders for one provider. `values` holds only
// non-secret field values (never a password/secret); `configured` says whether
// a credential is saved so the UI can show "connected" without exposing it.
export type IntegrationView = {
  id: string;
  enabled: boolean;
  configured: boolean;
  values: Record<string, string>;
  lastTest: IntegrationTestResult;
  routingParticipates: boolean;
};

export type IntegrationsView = {
  global: IntegrationsGlobal;
  providers: IntegrationView[];
};

// Result of scanning one product in a background tab. `classified` is true when
// the page hydrated far enough to split creators (influencer/brand/customer);
// when false, `counts` holds only what could be read (often the total) and the
// influencer figure is not trustworthy, so the UI shows "count not available".
export type ScanAsinResult = {
  counts: VideoCounts | null;
  classified: boolean;
};

export type OrderAsinItem = { asin: string; marketplace: string; title: string | null };
export type OrderAsinsResult = { ok: boolean; items: OrderAsinItem[]; error?: string };

// One product's current state as read by the background tab scan, for the
// watchlist to diff against the last check.
export type ProductSnapshotResult = {
  inStock: boolean | null;
  influencerVideos: number | null;
  priceCents: number | null;
};

// What the product/search "Watch" button sends to add an item.
export type WatchInput = {
  asin: string;
  marketplace: string;
  title: string | null;
  notifyOn?: WatchCondition[];
};

// Returned by the watchlist add/remove/get messages: the full current list,
// plus atCap on add when the watchlist is full so the UI can explain the block.
export type WatchlistResult = { items: WatchItem[]; atCap?: boolean };

// What the grid's "watch this campaign" bell sends to add a Last Call watch.
export type CampaignWatchInput = { campaignId: string; brand: string | null };

// Returned by the campaign watch add/remove/list messages: the set of currently
// watched campaign ids (for the grid overlay to reflect bell state), plus atCap
// on add when the campaign watchlist is full.
export type CampaignWatchListResult = { campaignIds: string[]; atCap?: boolean };

// One normalized Creator API (PA-API) product row. Mirrors the server's
// EnrichedItem shape in src/lib/paapi.ts, one per (asin, marketplace).
export type EnrichedProduct = {
  asin: string | null;
  marketplace: string;
  found: boolean;
  title: string | null;
  brand: string | null;
  priceDisplay: string | null;
  priceCents: number | null;
  currency: string | null;
  availability: string | null;
  primeEligible: boolean | null;
  binding: string | null;
  browseNode: string | null;
  imageUrl: string | null;
  detailPageUrl: string | null;
  error: string | null;
};

// Response of ENRICH_PRODUCTS. `configured` is false when the user has not
// stored any Creator API credentials (so the caller can prompt them and fall
// back to scrape data); `items` holds one entry per requested ASIN.
export type EnrichResult = {
  ok: boolean;
  configured: boolean;
  items: Array<{ asin: string; results: EnrichedProduct[] }>;
  error?: string;
};

// One curated aggregator site the harvester offers in its picker.
export type DealSource = { url: string; label: string };

// Result of HARVEST_DEAL_SITES: the deduped products found across every URL,
// per-URL fetch errors, and whether a cap (too many URLs or too many products)
// truncated the run so the UI can say so instead of implying full coverage.
export type HarvestResult = {
  ok: boolean;
  deals: HarvestedDeal[];
  errors: Array<{ url: string; error: string }>;
  capped: boolean;
};

export type IntegrationTestOutcome = { ok: boolean; message: string };
export type GenerateLinkResult = { ok: boolean; url?: string; error?: string };
export type OpenAiResult = { ok: boolean; text?: string; error?: string };

export type AiChatTurn = { role: "user" | "assistant"; content: string };
export type AiChatImage = { url: string; alt: string };
export type AiChatResult = { ok: boolean; reply?: string; images?: AiChatImage[]; error?: string };
export type VoiceSessionResult = {
  ok: boolean;
  value?: string;
  model?: string;
  maxSessionSecs?: number;
  sessionId?: string | null;
  error?: string;
};
export type VoiceToolResult = { ok: boolean; result?: unknown; error?: string };
export type VoiceTranscriptResult = { ok: boolean; error?: string };

export type { AsinEarnings, EarningsLookupResult, HudCommand, HudCommandResult, HudStatus, PairResult };
export type { PricePoint };
export type {
  LinkPixel,
  LinkStatsRange,
  LinkTrafficFilter,
  ListResult,
  PixelsResult,
  RepointResult,
  StatsResult,
} from "../integrations/ib-links-client";
export type { BrandedMintInput, BulkMintResult } from "../background/links";
export type { UpdateStateView } from "../background/update";

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
