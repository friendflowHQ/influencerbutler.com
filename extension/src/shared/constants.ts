export const EXT_VERSION = "0.1.1";

export const API_BASE = "https://www.influencerbutler.com";

export const ENDPOINTS = {
  authCheck: `${API_BASE}/api/extension/auth/check`,
  scans: `${API_BASE}/api/extension/scans`,
  gaps: `${API_BASE}/api/extension/gaps`,
  storefrontIssues: `${API_BASE}/api/extension/storefront-issues`,
  orders: `${API_BASE}/api/extension/orders`,
  feedback: `${API_BASE}/api/extension/feedback`,
  // Creator API (PA-API) credential vault + product enrichment. The vault only
  // ever stores the secret encrypted server-side; the extension never keeps it.
  creatorApi: `${API_BASE}/api/extension/creator-api`,
  enrich: `${API_BASE}/api/extension/enrich`,
  // AI concierge text chat (same brain as the website + desktop app).
  aiChat: `${API_BASE}/api/ai-concierge/chat`,
  // AI concierge voice (OpenAI Realtime over WebRTC). The background worker mints
  // the ephemeral token / runs tool calls / saves the transcript with the license
  // bearer; the chat page owns the peer connection + mic.
  voiceSession: `${API_BASE}/api/ai-concierge/session`,
  voiceTool: `${API_BASE}/api/ai-concierge/tool`,
  voiceTranscript: `${API_BASE}/api/ai-concierge/transcript`,
  // Deal Sites Harvester: sync harvested deals for the dashboard record, and
  // fetch the curated list of aggregator sites to offer in the picker.
  deals: `${API_BASE}/api/extension/deals`,
  dealSources: `${API_BASE}/api/extension/deal-sources`,
  // Instagram Goldmine (self-hosted build only): harvested creator + email rows.
  instagramCreators: `${API_BASE}/api/extension/instagram-creators`,
} as const;

// Influencer Butler branded short-link service (links.influencerbutler.com),
// the same worker the desktop app's "selfhosted" DeepLink Routing option calls.
// The extension authenticates each request with the signed-in Lemon Squeezy
// license key (no separate credential), mirroring SelfHostedLinkClient in the
// desktop repo. `create` mints/looks up a branded link; `list` is the
// owner-scoped registry; `stats`/`events` are the Ledger analytics; `repoint`
// self-heals an already-posted link; `publish` pushes the routing definition so
// the edge does Passport / Best-Rate / heal at click time; `pixels` saves the
// account-wide retargeting pixels (the Doorbell).
export const IB_LINKS_BASE = "https://links.influencerbutler.com";
export const IB_LINKS_ENDPOINTS = {
  create: `${IB_LINKS_BASE}/api/links`,
  list: `${IB_LINKS_BASE}/api/links/list`,
  stats: `${IB_LINKS_BASE}/api/links/stats`,
  events: `${IB_LINKS_BASE}/api/links/events`,
  repoint: `${IB_LINKS_BASE}/api/links/repoint`,
  publish: `${IB_LINKS_BASE}/api/links/publish`,
  pixels: `${IB_LINKS_BASE}/api/links/pixels`,
} as const;

// Bulk mint from a harvested batch (Deal Sites, Orders Butler, storefront). The
// worker mints one link per POST, so a bulk run is a capped, paced sequence of
// creates (there is no batch endpoint), mirroring the desktop mintBulkLinks cap
// of 100. Paced with jitter like the other harvest loops so it reads like a
// person creating links, not a burst.
export const LINK_MINT_BULK_CAP = 100;
export const LINK_MINT_DELAY_MIN_MS = 250;
export const LINK_MINT_DELAY_MAX_MS = 600;

// The Start Here onboarding walkthrough (opened on install). The Creator API
// setup step embeds this YouTube walkthrough (same video as the desktop app's
// API Integrations > Creator API screen and the api-integrations tutorial), and
// the "Show me where" button points at the Amazon Associates credentials page.
export const ONBOARDING_VIDEO_ID = "plZS_nXX-BE";
export const ASSOCIATES_CREDENTIALS_URL =
  "https://affiliate-program.amazon.com/assoc_credentials/home";
export const API_INTEGRATIONS_TUTORIAL_URL = `${API_BASE}/help/tutorials/api-integrations`;

// "Show me where" destinations for the deeplink and affiliate-network
// providers, matching the desktop app's API Integrations screen. Each points at
// the provider's own dashboard where the API key (and secret / group id where
// applicable) is issued.
export const PROVIDER_CREDENTIALS_URLS = {
  urlgenius: "https://urlgeni.us/",
  geniuslink: "https://my.geni.us/",
  linktwin: "https://linktw.in/",
  levanta: "https://app.levanta.io/",
  archer: "https://app.archeraffiliates.com/",
  logie: "https://www.mylogie.com/",
} as const;

// Marketplaces the onboarding credential form offers. Host is what the
// extension records from the page URL; label is shown to the user. Kept in sync
// with MARKETPLACES in src/lib/paapi.ts on the server.
export const CREATOR_API_MARKETPLACES: ReadonlyArray<{ host: string; label: string }> = [
  { host: "amazon.com", label: "United States (amazon.com)" },
  { host: "amazon.co.uk", label: "United Kingdom (amazon.co.uk)" },
  { host: "amazon.ca", label: "Canada (amazon.ca)" },
  { host: "amazon.com.au", label: "Australia (amazon.com.au)" },
  { host: "amazon.de", label: "Germany (amazon.de)" },
  { host: "amazon.fr", label: "France (amazon.fr)" },
  { host: "amazon.it", label: "Italy (amazon.it)" },
  { host: "amazon.es", label: "Spain (amazon.es)" },
  { host: "amazon.co.jp", label: "Japan (amazon.co.jp)" },
  { host: "amazon.in", label: "India (amazon.in)" },
  { host: "amazon.com.mx", label: "Mexico (amazon.com.mx)" },
];

// Campaign membership filters (CC / SPCC), downloaded once a day and checked
// locally. GET /api/extension/catalogue/{kind}.
export const CATALOGUE_BASE = `${API_BASE}/api/extension/catalogue`;
export const CATALOGUE_ALARM = "ib-catalogue";
export const CATALOGUE_PERIOD_MINUTES = 6 * 60;
export const CATALOGUE_STALE_MS = 20 * 60 * 60 * 1000;

// Amazon Associates commission-rate schedule ("rate card"), harvested centrally
// and served here. Downloaded once a day and looked up locally so break-even
// has a real category rate even when SiteStripe is not on the page. Refreshed
// on the same alarm as the catalogue.
export const RATE_CARD_BASE = `${API_BASE}/api/extension/rate-card`;
export const RATE_CARD_STALE_MS = 20 * 60 * 60 * 1000;

// Sync queue.
export const SYNC_ALARM = "ib-sync";
export const SYNC_PERIOD_MINUTES = 2;
export const SYNC_BATCH_MAX = 50;
export const QUEUE_CAP = 500;

// Explicit page-fetch scans (order history, storefront). Sequential with
// jitter so the traffic looks like a person reading pages, not a crawler.
export const FETCH_DELAY_MIN_MS = 2500;
export const FETCH_DELAY_MAX_MS = 4000;
export const ORDER_SCAN_CAP = 20;
export const STOREFRONT_SCAN_CAP = 25;
export const SCAN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Orders Butler full-history harvest. Walks order-history pages the way the
// desktop runner does: newest-first, one page every FETCH_DELAY, stopping at
// the cached cursor on incremental runs. The page cap is a safety valve so a
// parsing miss can never turn into an unbounded crawl; at 10 orders/page it
// covers well over a decade of history before tripping.
export const ORDER_HARVEST_PAGE_CAP = 200;
export const ORDER_HARVEST_START_YEAR = 2013;

// Deep Scan of a product's video carousels. Replays the widget's own ajax
// endpoint page by page. These are light HTML/JSON fragments (not full product
// pages), so they are paced gently like the storefront getItems feed rather
// than the heavier 2.5-4s page fetches. Caps are runaway safety valves: a
// product with hundreds of videos still finishes, but a parsing miss can never
// become an unbounded crawl.
export const VIDEO_HARVEST_PAGE_CAP = 40;
export const VIDEO_HARVEST_VIDEO_CAP = 1000;
export const VIDEO_HARVEST_DELAY_MIN_MS = 150;
export const VIDEO_HARVEST_DELAY_MAX_MS = 400;

// Deal Sites Harvester. Fetches each aggregator URL in the background (needs an
// optional host permission the user grants per run), extracts Amazon products,
// and enriches them. Paced like a person opening tabs, with caps as runaway
// safety valves: a huge or malicious list can never turn into an unbounded
// crawl. deal.push.batch is chunked so one big harvest is not a single command.
export const DEAL_HARVEST_URL_CAP = 40;
export const DEAL_HARVEST_ASIN_CAP = 1000;
export const DEAL_HARVEST_DELAY_MIN_MS = 800;
export const DEAL_HARVEST_DELAY_MAX_MS = 1800;
export const DEAL_HARVEST_FETCH_TIMEOUT_MS = 15_000;
export const DEAL_PUSH_CHUNK = 200;
export const DEAL_SOURCES_STALE_MS = 20 * 60 * 60 * 1000;
// Amazon short links (amzn.to / a.co / amzn.eu / amzn.asia) found on a page
// carry no ASIN in the URL, so each is resolved by following its redirect to
// the real product URL. Capped per run and paced lighter than page fetches
// (the redirector is Amazon's own: one hop, no body read).
export const DEAL_HARVEST_SHORTLINK_CAP = 100;
export const DEAL_HARVEST_SHORTLINK_DELAY_MIN_MS = 150;
export const DEAL_HARVEST_SHORTLINK_DELAY_MAX_MS = 400;

// Instagram Goldmine (self-hosted build only). Harvested creator rows are
// pushed into the desktop app's Pitch / Group Invite butlers in chunks so one
// big run is not a single oversized bridge command.
export const CREATOR_PUSH_CHUNK = 200;
// Where to fetch a bio-link site for the "also check bio-link website" toggle:
// paced and time-boxed like the deal harvester's aggregator fetches.
export const IG_BIOLINK_FETCH_TIMEOUT_MS = 12_000;

// Amazon onsite commission defaults by category, user-overridable. These are
// starting points for the calculator, not a promise of what Amazon pays.
export const COMMISSION_DEFAULTS: ReadonlyArray<{ key: string; label: string; ratePct: number }> = [
  { key: "default", label: "Most categories", ratePct: 2.5 },
  { key: "beauty", label: "Beauty", ratePct: 3 },
  { key: "fashion", label: "Clothing and shoes", ratePct: 4 },
  { key: "furniture", label: "Furniture and home", ratePct: 3 },
  { key: "grocery", label: "Grocery", ratePct: 1 },
  { key: "electronics", label: "Electronics", ratePct: 2 },
  { key: "toys", label: "Toys", ratePct: 3 },
];

export const UI_PREFIX = "ib-ext";

// Desktop app (HUD) local bridge. Loopback WebSocket the running app exposes;
// see docs/extension-local-bridge.md. The app probes 48620 first, then the
// next two ports if taken, so the extension tries all three.
export const BRIDGE_PORTS = [48620, 48621, 48622] as const;
export const BRIDGE_PROBE_TIMEOUT_MS = 700;
export const BRIDGE_STATUS_TTL_MS = 15_000;

// Where to send someone who needs the app. Trial link is tracked.
export const APP_TRIAL_URL = `${API_BASE}/go/download`;
export const APP_LEARN_URL = `${API_BASE}/extension`;

// ASIN watchlist. The background poller opens each watched product in a
// background tab on this alarm, but only a small batch per run (least-recently
// checked first) so the MV3 worker's awake time stays bounded and a killed
// worker resumes cleanly on the next alarm. Full coverage of a 50-item list
// takes several runs, which is fine for restock / open-slot alerts.
export const WATCHLIST_ALARM = "ib-watchlist";
export const WATCHLIST_PERIOD_MINUTES = 3 * 60;
export const WATCHLIST_RUN_CAP = 8;

// Last Call Butler. When the creator is watching one or more Creator Connections
// campaigns, this alarm opens the campaign grid in a single background tab so the
// MAIN-world connect-hook re-captures how full each campaign is; a watched
// campaign crossing the user's fill threshold fires a "Last Call" notification.
// One tab per run regardless of list size (the grid holds every campaign), so
// the cadence can be tighter than the product watchlist without extra tabs.
export const CAMPAIGN_WATCH_ALARM = "ib-last-call";
export const CAMPAIGN_WATCH_PERIOD_MINUTES = 30;
// The grid page the poll opens: the Affiliate+ opportunities tab (the verified
// source of the fill fields). A logged-out or ineligible load simply never fires
// the campaign/search fetch, so the poll no-ops rather than false-alerting.
export const CAMPAIGN_GRID_URL =
  "https://affiliate-program.amazon.com/p/connect/requests?status=opportunity&type=affiliate-plus&sortBy=recommended_for_you&campaignStatuses=active%2Cpending&nonFullyClaimedOnly=false";

// Re-engagement nudges. Anchored to first actual use (see storage.firstUseAt):
// day 1 invites the user to the Facebook community, day 3 invites them to
// download the free desktop app. Each fires once via an OS notification (on the
// alarm below) and once via an in-page modal on the next Amazon visit.
export const FACEBOOK_GROUP_URL = "https://www.facebook.com/groups/influencerbutler";
export const NUDGE_FB_ALARM = "ib-nudge-fb";
export const NUDGE_APP_ALARM = "ib-nudge-app";
export const NUDGE_FB_DELAY_MS = 24 * 60 * 60 * 1000; // 1 day after first use
export const NUDGE_APP_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days after first use

// Extension self-update banner. Chrome stages extension updates itself (and in
// MV3 applies them shortly after the worker idles); we just record what is
// pending so the on-page banner and popup card can tell the user. State lives
// in its own storage key (no schema bump, like the app-notification cursor).
// "Remind me later" snoozes the banner for the window below.
export const UPDATE_STORAGE_KEY = "ib-update";
export const UPDATE_REMIND_MS = 3 * 24 * 60 * 60 * 1000;

// Deals Influencer Butler workspaces the extension can target. This is a hint list for
// the picker; the app is the source of truth and may add or rename its own.
export const DEAL_WORKSPACES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "default", label: "Deals Influencer Butler (main)" },
  { key: "garden-bargains", label: "Garden Bargains" },
  { key: "prime-day", label: "Prime Day Butler" },
  { key: "black-friday", label: "Black Friday Butler" },
];
