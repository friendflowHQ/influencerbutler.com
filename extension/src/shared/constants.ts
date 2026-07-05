export const EXT_VERSION = "0.1.0";

export const API_BASE = "https://www.influencerbutler.com";

export const ENDPOINTS = {
  authCheck: `${API_BASE}/api/extension/auth/check`,
  scans: `${API_BASE}/api/extension/scans`,
  gaps: `${API_BASE}/api/extension/gaps`,
  storefrontIssues: `${API_BASE}/api/extension/storefront-issues`,
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
