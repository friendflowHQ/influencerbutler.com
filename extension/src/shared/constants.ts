export const EXT_VERSION = "0.1.0";

export const API_BASE = "https://www.influencerbutler.com";

export const ENDPOINTS = {
  authCheck: `${API_BASE}/api/extension/auth/check`,
  scans: `${API_BASE}/api/extension/scans`,
  gaps: `${API_BASE}/api/extension/gaps`,
  storefrontIssues: `${API_BASE}/api/extension/storefront-issues`,
  orders: `${API_BASE}/api/extension/orders`,
  feedback: `${API_BASE}/api/extension/feedback`,
} as const;

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

// Daily Deals workspaces the extension can target. This is a hint list for
// the picker; the app is the source of truth and may add or rename its own.
export const DEAL_WORKSPACES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "default", label: "Amazon Daily Deals (main)" },
  { key: "garden-bargains", label: "Garden Bargains" },
  { key: "prime-day", label: "Prime Day Butler" },
  { key: "black-friday", label: "Black Friday Butler" },
];
