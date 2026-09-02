import type { Finding, VideoCounts } from "../transport/types";
import type { CampaignFill } from "../amazon/creator-campaigns";
import type { HarvestedDeal } from "../tools/deal-harvester/extract";
import type {
  AsinEarnings,
  BrandEnrichmentRecord,
  BrandEnrichmentResult,
  CampaignStatusRecord,
  CampaignStatusResult,
  DesktopTemplate,
  EarningsLookupResult,
  HudCommand,
  HudCommandResult,
  HudStatus,
  OutreachKeywordsResult,
  OutreachRecord,
  OwnershipLookupResult,
  OwnershipRecord,
  PairResult,
  TemplatesLookupResult,
} from "../transport/hud-commands";
import type {
  IntegrationsState,
  IntegrationTestResult,
  PricePoint,
  ProductList,
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
import type { LinkNotice } from "../integrations/link-notice";
import type { BrandedMintInput, BulkMintResult } from "../background/links";
import type {
  RelayClaimResult,
  RelaySendResult,
  RelayTarget,
  RelayTargetsResult,
} from "../background/relay";

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
    | "creator-manage"
    | "campaign-grid"
    | "campaign-detail"
    | "search"
    | "discovery"
    | "deals"
    | "idea-list"
    | "other";
  toolSummaries: Array<{ label: string; value: string }>;
};

export type RuntimeMessage =
  | { kind: "RECORD_FINDING"; finding: Finding }
  | { kind: "GET_AUTH_STATUS" }
  | { kind: "SIGN_IN"; licenseKey: string }
  | { kind: "SIGN_OUT" }
  // Sent by the site-referral content script when it reads an affiliate code
  // (from the ib_aff_src cookie or a ?code= param) on an influencerbutler.com
  // page. The background stores it first-touch so a later license activation can
  // credit the affiliate. Fire-and-forget: the content script does not wait.
  | { kind: "CAPTURE_AFFILIATE_CODE"; code: string; source: string | null }
  | { kind: "FLUSH_QUEUE" }
  | { kind: "GET_PAGE_STATUS" }
  | { kind: "GET_HUD_STATUS"; force?: boolean }
  | { kind: "SEND_HUD_COMMAND"; command: HudCommand }
  // Ask the running desktop app what the creator earned on a batch of ASINs, so
  // product pages and search tiles can show real earnings. Routed to the app
  // over the local bridge; returns paired:false when the app was never connected.
  | { kind: "LOOKUP_EARNINGS"; asins: string[] }
  // Look up the real Creator Connections commission rate for a batch of ASINs
  // (server-side join of the CC catalogue), so a campaign chip can show the
  // actual percent instead of a bare yes/no. Cached a day in the background.
  | { kind: "LOOKUP_CC_RATES"; asins: string[] }
  // Read the locally-built price history for a product, for the sparkline on the
  // product panel. Returns points oldest-first (may be empty on a fresh install).
  | { kind: "GET_PRICE_HISTORY"; asin: string; marketplace: string }
  // Ask the running desktop app for an ASIN's full price/rank history from its
  // durable time-series (deeper than the local capped store). Routed over the
  // local bridge; returns paired:false when the app was never connected.
  | { kind: "GET_DESKTOP_HISTORY"; asin: string }
  // Ask the running desktop app which brands the creator messaged with the
  // "Message Brands" tool and the keyword that surfaced each, so the Creator
  // Connections Messages widget can badge each conversation with its keyword.
  // Routed over the local bridge; returns paired:false when never connected.
  | { kind: "FETCH_OUTREACH_KEYWORDS" }
  // Ask the running desktop app for the creator's own message templates (and the
  // resolved placeholder values from that workspace), so the Message Templates
  // picker on the Creator Connections composer can offer them next to the local
  // ones. Routed over the local bridge; returns paired:false when never connected.
  | { kind: "FETCH_MESSAGE_TEMPLATES" }
  // Batch-resolve a set of brand names (read from the Messages inbox) against the
  // desktop app's global CC brand index, so *inbound* conversations the creator
  // never pitched can still show a rate/cadence chip. Routed over the local
  // bridge; returns paired:false when never connected.
  | { kind: "FETCH_BRAND_ENRICHMENT"; brands: string[] }
  // Ask the running desktop app whether the creator already owns a batch of ASINs
  // (Orders Butler history) and whether they already posted/promoted each
  // (Storefront / Deals / YouTube), so product pages and search/deals tiles
  // can badge "you already own this / you already posted this". Routed over the
  // local bridge; returns paired:false when the app was never connected.
  | { kind: "LOOKUP_OWNERSHIP"; asins: string[] }
  // Ask the running desktop app whether the creator is already ENROLLED in a
  // Creator Connections / SPCC campaign for a batch of ASINs (its accepted-history
  // ledger, kept fresh by the app's hourly sync), plus the accepted rate and their
  // realized EPC, so a product page can badge "you're already enrolled". Personal
  // enrollment lives only on the desktop, so there is no server fallback: returns
  // paired:false when the app was never connected.
  | { kind: "LOOKUP_CAMPAIGN_STATUS"; asins: string[] }
  // Read pooled data for a product from the shared catalogue ("internal Keepa"):
  // latest snapshot, price/rank trend, real bought-past-month, and an estimated
  // monthly-sales figure. Routed through the worker so it carries the license
  // key; available to any signed-in user regardless of whether they contribute.
  | { kind: "GET_MARKET"; asin: string; marketplace: string; retailer?: "amazon" | "walmart" }
  // Batched sibling of GET_MARKET: one round trip for a whole page of ASINs (the
  // search overlay wants a market read per tile). The endpoint already accepts up
  // to 50 comma-joined ASINs; this returns them all so the overlay does not fire
  // one message per card.
  | {
      kind: "GET_MARKET_BATCH";
      asins: string[];
      marketplace: string;
      retailer?: "amazon" | "walmart";
    }
  // Per-video "passport" read from the shared video-placement pool: presence,
  // rotation, and daily visibility for one creator video over 90 days.
  | { kind: "GET_VIDEO_INTEL"; videoId: string; marketplace: string }
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
  // Wipe a provider's stored credentials ("Clear saved keys"), so a user can
  // deliberately remove an old key instead of guessing whether it is still saved.
  | { kind: "CLEAR_INTEGRATION"; id: string }
  | { kind: "TEST_INTEGRATION"; id: string }
  | { kind: "TEST_ALL_INTEGRATIONS" }
  | {
      kind: "GENERATE_AFFILIATE_LINK";
      asin: string;
      marketplace: string;
      url?: string;
      retailer?: "amazon" | "walmart";
    }
  | { kind: "REWRITE_LINK"; url: string }
  // Clean Link (popup tool): strip another person's tracking off a pasted url,
  // expanding a short link first, then re-tag with the user's own attribution.
  | { kind: "CLEAN_LINK"; url: string }
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
  // Total creator videos already on a product's Amazon listing (Amazon's own
  // #videoCount header), fetched from the worker for the same CORS reason: a
  // content script on affiliate-program.amazon.com cannot fetch www.amazon.com.
  // The Creator Connections overlays show this as a saturation signal. Returns a
  // number (0 for a product with no videos) or null on a miss so the caller retries.
  | { kind: "FETCH_VIDEO_COUNT"; asin: string; marketplace: string }
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
  // Batch enrichment for the popup's Watchlist / My Lists rows: for each ref the
  // background merges local CC/SPCC bloom membership, the real CC commission
  // rate, and (when needsImage) a Creator API image/title lookup, writing the
  // fetched image/title back into the watchlist / product-list store so a later
  // open is instant. One round-trip for the whole visible set.
  | { kind: "ENRICH_ROWS"; refs: RowEnrichRef[] }
  // ASIN watchlist: add/remove a product and read the current list. The
  // background poller checks each on an alarm and notifies on a change.
  | { kind: "ADD_TO_WATCHLIST"; item: WatchInput }
  | { kind: "REMOVE_FROM_WATCHLIST"; asin: string; marketplace: string }
  | { kind: "SET_WATCH_CONDITIONS"; asin: string; marketplace: string; notifyOn: WatchCondition[] }
  | { kind: "GET_WATCHLIST" }
  | { kind: "IS_WATCHED"; asin: string; marketplace: string }
  // Product lists ("Add to List"): user-named collections, local-only, driven
  // from the tile menu and the popup. ADD accepts either an existing listId or a
  // newListName to create-and-add in one call.
  | { kind: "GET_PRODUCT_LISTS" }
  | { kind: "CREATE_PRODUCT_LIST"; name: string }
  | { kind: "RENAME_PRODUCT_LIST"; id: string; name: string }
  | { kind: "DELETE_PRODUCT_LIST"; id: string }
  | { kind: "ADD_TO_PRODUCT_LIST"; listId?: string; newListName?: string; item: ProductListInput }
  | {
      kind: "ADD_MANY_TO_PRODUCT_LIST";
      listId?: string;
      newListName?: string;
      items: ProductListInput[];
    }
  | { kind: "REMOVE_FROM_PRODUCT_LIST"; listId: string; asin: string; marketplace: string }
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
  // Campaign Butler: build the on-demand "Butler's Brief" for one campaign. The
  // overlay computes the score + confidence locally and sends the campaign
  // signals; the worker looks up our catalogue demand for the campaign's ASINs
  // and POSTs everything to /api/extension/campaign-brief for the reasoning
  // prose, then returns the sections plus the resolved demand.
  | { kind: "GET_CAMPAIGN_BRIEF"; signals: CampaignBriefSignals }
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
  | { kind: "APPLY_UPDATE" }
  // Post-update "What's New" notice: read what changed in the running version
  // (changelog highlights + the user's own resolved bug reports), and dismiss it
  // (advances the stored "last shown version" so both surfaces stop showing it).
  | { kind: "GET_WHATS_NEW" }
  | { kind: "DISMISS_WHATS_NEW" }
  // Cross-device relay (send commands to the desktop app on ANOTHER computer).
  // Claim a 6-digit link code shown by that app, list the linked desktops, send
  // one command to a linked desktop, and read/set the default remote target the
  // deal harvester falls back to when no local app is running here.
  | { kind: "RELAY_CLAIM_LINK"; code: string; label?: string }
  | { kind: "RELAY_LIST_TARGETS" }
  | { kind: "RELAY_SEND"; command: HudCommand; targetInstanceId: string }
  | { kind: "RELAY_GET_STATE" }
  | { kind: "RELAY_SET_DEFAULT_TARGET"; target: { instanceId: string; label: string | null } | null };

export type IgBioLinkResult = { email: string | null };

// Cross-device relay UI state for the popup's Remote devices section: whether
// the account is connected (a license key is signed in), the linked desktops on
// other computers, and which one is the default fallback for the deal harvester.
export type RelayStateView = {
  signedIn: boolean;
  targets: RelayTarget[];
  defaultTarget: { instanceId: string; label: string | null } | null;
  error?: string;
};

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
  // Product image captured at add time (from the tile / product page), so the
  // watchlist row shows a thumbnail immediately without waiting on the sign-in
  // gated Creator API backfill. Null when the source had no image.
  imageUrl?: string | null;
  notifyOn?: WatchCondition[];
};

// Returned by the watchlist add/remove/get messages: the full current list,
// plus atCap on add when the watchlist is full so the UI can explain the block.
export type WatchlistResult = { items: WatchItem[]; atCap?: boolean };

// What "Add to List" sends. imageUrl/title are optional because a search tile
// has less than a product page; the store fills nulls where absent.
export type ProductListInput = {
  asin: string;
  marketplace: string;
  title?: string | null;
  imageUrl?: string | null;
};

// Returned by every product-list message: the full current set of lists, plus
// caps (atCap when there are already PRODUCT_LISTS_CAP lists, atItemCap when the
// target list is full) and listId (the created/affected list) so the tile menu
// can confirm "added to <name>".
export type ProductListsResult = {
  lists: ProductList[];
  atCap?: boolean;
  atItemCap?: boolean;
  listId?: string;
  // Set by the batch add (ADD_MANY_TO_PRODUCT_LIST): how many items actually
  // landed after dedup + the item cap, so the UI can say "Added N variations".
  added?: number;
};

// What the grid's "watch this campaign" bell sends to add a Last Call watch.
export type CampaignWatchInput = { campaignId: string; brand: string | null };

// Returned by the campaign watch add/remove/list messages: the set of currently
// watched campaign ids (for the grid overlay to reflect bell state), plus atCap
// on add when the campaign watchlist is full.
export type CampaignWatchListResult = { campaignIds: string[]; atCap?: boolean };

// Campaign Butler ("The Butler's Brief"). What the grid overlay sends for one
// campaign: the DOM/API signals plus the locally-computed score, band, and
// confidence (all deterministic), so the server only writes the prose. ccStats
// are the captured Creator Connections conversion numbers when Amazon exposed
// them (usually null: the brief is estimator-first).
export type CampaignCcStats = {
  ordersLast30: number | null;
  salesLast30Cents: number | null;
  roas: number | null;
  ordersTotal: number | null;
};

export type CampaignBriefSignals = {
  brand: string | null;
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  daysRemaining: number | null;
  slotsFilled: number | null;
  slotsTotal: number | null;
  fullyClaimed: boolean | null;
  score: number;
  band: "hot" | "warm" | "cool";
  confidence: number;
  ccStats: CampaignCcStats | null;
  asins: string[];
  marketplace: string;
  locale?: string | null;
};

// Our catalogue's demand read for the campaign's standout product, resolved by
// the worker and returned so the panel can render the real units/revenue numbers
// (the "Pick of the shelf" figures) itself rather than trusting the model.
export type CampaignBriefDemand = {
  asin: string;
  estMonthlySales: number | null;
  estMonthlyRevenueCents: number | null;
  boughtPastMonth: number | null;
  priceCents: number | null;
  category: string | null;
  calibrated: boolean;
  // Total creator videos already on this product's listing (Amazon's #videoCount),
  // the "creator saturation" read: fewer means less competition. null when the
  // worker could not resolve it; 0 is a real "no videos yet".
  videoCount: number | null;
};

// The prose sections the server model wrote (mirror of CampaignBriefSections in
// src/lib/campaign-brief.ts). null when no LLM key is configured or the call
// failed, so the panel falls back to the local score breakdown.
export type CampaignBriefSections = {
  verdictWord: string;
  whyTake: string[];
  whatToFilm: string[];
  pickReason: string | null;
  onAmazon: string;
  offAmazon: string[];
  audiences: string[];
};

// Returned by GET_CAMPAIGN_BRIEF. sections is the model's prose (or null on a
// miss); demand is the resolved standout-product estimate (or null when no ASIN
// was in the catalogue). migrationPending mirrors the market read.
export type CampaignBriefResult = {
  ok: boolean;
  migrationPending?: boolean;
  sections: CampaignBriefSections | null;
  demand: CampaignBriefDemand | null;
  error?: string;
  // Short, non-sensitive reason the prose was empty (from the server, e.g.
  // "groq-400" or "no-provider"), surfaced under the fallback so an empty brief
  // can be diagnosed in the wild. Null/absent on success.
  diag?: string | null;
  // Whether the creator has connected their own OpenAI key in API Integrations.
  // Lets the fallback UI tell "no key: connect one" apart from "key connected
  // but the brief still failed: check it". Non-secret; only the boolean travels.
  openaiConnected?: boolean;
};

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

// One ASIN's best active Creator Connections campaign rate, as served by
// /api/extension/cc-rates. `endsAt` is the campaign end date when known.
export type CcRate = { ratePct: number; brand: string | null; endsAt: string | null };

// Response of LOOKUP_CC_RATES: only ASINs with a known active campaign rate
// appear in `rates`. `ok:false` means the server could not be reached (the
// caller keeps its plain campaign chip).
export type CcRatesResult = { ok: boolean; rates: Record<string, CcRate> };

// Response of ENRICH_PRODUCTS. `configured` is false when the user has not
// stored any Creator API credentials (so the caller can prompt them and fall
// back to scrape data); `items` holds one entry per requested ASIN.
export type EnrichResult = {
  ok: boolean;
  configured: boolean;
  items: Array<{ asin: string; results: EnrichedProduct[] }>;
  error?: string;
};

// One popup row to enrich. `source`/`listId` tell the background where to write
// a fetched image/title back; `needsImage` is true only when the stored row is
// missing an image or title, so an already-complete row skips the server call
// but still gets CC/SPCC/rate from the local catalogue.
export type RowEnrichRef = {
  asin: string;
  marketplace: string;
  // "link" rows come from the Link Butler registry/ledger. They carry no listId
  // and are never persisted (link records live in the external links worker, not
  // a local store), so a "link" ref skips the write-back that watchlist/list use.
  source: "watchlist" | "list" | "link";
  listId?: string;
  needsImage: boolean;
};

// Per-ASIN result of ENRICH_ROWS. cc/spcc are bloom membership; ratePct is the
// real CC commission when the ASIN is in an active campaign (null otherwise);
// imageUrl/title are filled only when a Creator API lookup ran and found them.
export type RowBadge = {
  cc: boolean;
  spcc: boolean;
  ratePct: number | null;
  imageUrl: string | null;
  title: string | null;
  brand: string | null;
};

// Response of ENRICH_ROWS, keyed by upper-cased ASIN.
export type RowBadgesResult = { badges: Record<string, RowBadge> };

// One point in a shared-catalogue price/rank trend (oldest-first on read).
export type MarketTrendPoint = { capturedAt: string; priceCents: number | null; bsrRank: number | null };

// Pooled shared-catalogue data for one product. estMonthlySales is modeled from
// bsrRank via the per-category curve (null when there is no usable rank);
// estimateCalibrated is true once that category's curve was fit from real data
// rather than a seed. boughtPastMonth is Amazon's own real demand figure.
export type MarketProduct = {
  asin: string;
  marketplace: string;
  priceCents: number | null;
  currency: string;
  bsrRank: number | null;
  bsrCategory: string | null;
  boughtPastMonth: number | null;
  categoryLabel: string | null;
  brand: string | null;
  capturedAt: string;
  estMonthlySales: number | null;
  estimateCalibrated: boolean;
  trend: MarketTrendPoint[];
  // Walmart-only (absent/null on Amazon rows): Walmart has no BSR, so the
  // estimate is review-velocity based and carries an explicit confidence; the
  // raw review count rides along for the demand chip.
  estimateConfidence?: "low" | "medium";
  numReviews?: number | null;
  retailer?: "amazon" | "walmart";
};

// Response of GET_MARKET. product is null when the pool has nothing for the ASIN
// yet (fresh catalogue), or when the migration is not applied (migrationPending).
export type MarketResult = {
  ok: boolean;
  migrationPending?: boolean;
  product: MarketProduct | null;
};

// Response of GET_MARKET_BATCH. `products` holds one entry per ASIN the pool
// knows about (ASINs with nothing yet are simply absent, so the array can be
// shorter than the request). Empty + ok:false on a network miss or an unapplied
// migration, so the caller keeps its plain badges.
export type MarketBatchResult = {
  ok: boolean;
  migrationPending?: boolean;
  products: MarketProduct[];
};

// One day in a video's 90-day visibility series. "no_data" means no contributor
// observed the product that day: distinct from the video being absent.
export type VideoIntelDay = {
  day: string;
  status: "visible" | "no_data";
  asinCount: number;
};

// One current placement of the video (per ASIN), from the latest snapshot.
export type VideoIntelSnapshot = {
  asin: string;
  carousel: string;
  position: number | null;
  creatorName: string | null;
  creatorType: string;
  title: string | null;
  videoUrl: string | null;
  lastObservedAt: string | null;
};

// Response of GET_VIDEO_INTEL: the per-video passport. Longitudinal metrics are
// null while `collecting` is true (not enough distinct days have accrued yet),
// so the UI shows an honest "collecting" state instead of a fabricated number.
export type VideoIntelResult = {
  ok: boolean;
  migrationPending?: boolean;
  collecting: boolean;
  firstSeen: string | null;
  daysTracked: number;
  activeDays: number;
  productReach: number;
  upperShare: number | null;
  lowerShare: number | null;
  presenceRate: number | null;
  rotationRate: number | null;
  stability: number | null;
  activeDayStrength: number | null;
  series: VideoIntelDay[];
  snapshot: VideoIntelSnapshot[];
  lastObserved: string | null;
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
// `notice` explains why the url is not the link the user's setup asked for (for
// example the branded-link provider is selected but nobody is signed in). The
// url is still a working affiliate link, so callers copy it either way and just
// say what happened. See integrations/link-notice.
export type GenerateLinkResult = {
  ok: boolean;
  url?: string;
  error?: string;
  notice?: LinkNotice;
};
export type OpenAiResult = { ok: boolean; text?: string; error?: string };

// Clean Link result. `cleanUrl` is the tracking-free link (canonical when we
// recognized a product, else the input with known trackers stripped). `myLink`
// is that clean link re-tagged with the user's own attribution, present only
// when a product was recognized. `expandedFrom` is set when a short link was
// followed to reach the cleaned url; `expandFailed` when a short link could not
// be resolved (missing host permission or a network error). `myLinkNotice`
// rides along from the affiliate-link build (see GenerateLinkResult).
export type CleanLinkResult = {
  ok: boolean;
  error?: string;
  retailer?: "amazon" | "walmart" | null;
  productId?: string | null;
  cleanUrl?: string;
  matched?: boolean;
  myLink?: string;
  myLinkNotice?: LinkNotice;
  expandedFrom?: string;
  expandFailed?: boolean;
};

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

export type {
  AsinEarnings,
  BrandEnrichmentRecord,
  BrandEnrichmentResult,
  CampaignStatusRecord,
  CampaignStatusResult,
  DesktopTemplate,
  EarningsLookupResult,
  HudCommand,
  HudCommandResult,
  HudStatus,
  OutreachKeywordsResult,
  OutreachRecord,
  OwnershipLookupResult,
  OwnershipRecord,
  PairResult,
  TemplatesLookupResult,
};
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
export type { RelayClaimResult, RelaySendResult, RelayTarget, RelayTargetsResult } from "../background/relay";
export type { UpdateStateView } from "../background/update";
export type { WhatsNewView, ResolvedBug } from "../background/whats-new";

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
