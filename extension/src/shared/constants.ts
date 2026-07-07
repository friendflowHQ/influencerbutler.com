export const EXT_VERSION = "0.1.0";

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
} as const;

// The Start Here onboarding walkthrough (opened on install). The Creator API
// setup step embeds this YouTube walkthrough (same video as the desktop app's
// API Integrations > Creator API screen and the api-integrations tutorial), and
// the "Show me where" button points at the Amazon Associates credentials page.
export const ONBOARDING_VIDEO_ID = "plZS_nXX-BE";
export const ASSOCIATES_CREDENTIALS_URL =
  "https://affiliate-program.amazon.com/assoc_credentials/home";
export const API_INTEGRATIONS_TUTORIAL_URL = `${API_BASE}/help/tutorials/api-integrations`;

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

// Re-engagement nudges. Anchored to first actual use (see storage.firstUseAt):
// day 1 invites the user to the Facebook community, day 3 invites them to
// download the free desktop app. Each fires once via an OS notification (on the
// alarm below) and once via an in-page modal on the next Amazon visit.
export const FACEBOOK_GROUP_URL = "https://www.facebook.com/groups/influencerbutler";
export const NUDGE_FB_ALARM = "ib-nudge-fb";
export const NUDGE_APP_ALARM = "ib-nudge-app";
export const NUDGE_FB_DELAY_MS = 24 * 60 * 60 * 1000; // 1 day after first use
export const NUDGE_APP_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days after first use

// Daily Deals workspaces the extension can target. This is a hint list for
// the picker; the app is the source of truth and may add or rename its own.
export const DEAL_WORKSPACES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "default", label: "Amazon Daily Deals (main)" },
  { key: "garden-bargains", label: "Garden Bargains" },
  { key: "prime-day", label: "Prime Day Butler" },
  { key: "black-friday", label: "Black Friday Butler" },
];
