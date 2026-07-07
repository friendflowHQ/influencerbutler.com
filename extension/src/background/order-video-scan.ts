import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import { log } from "../shared/log";
import type { Finding, ProductScanFinding, VideoCounts } from "../transport/types";
import type {
  OrderAsinItem,
  OrderAsinsResult,
  ProductSnapshotResult,
  ScanAsinResult,
} from "../shared/messages";

// Background half of the Orders Butler "update influencer video count" pass.
//
// The order-history content script drives the loop (it is long-lived; the MV3
// worker is not), asking us one product at a time. For each ASIN we open the
// product page in a background tab so its client-side video widget hydrates and
// the page's own content script emits a classified product_scan finding. We
// watch for that finding (correlated by the tab it came from), take the best
// coverage we see within a short settle window, then close the tab and hand the
// counts back. A background fetch of the page would only ever see the static
// #videoCount total, never the creator breakdown, which is why a real tab is
// required for an exact influencer figure.

// How long to keep a product tab open waiting for its video breakdown to
// hydrate before giving up on it. Amazon loads the widget lazily and our poll
// runs every 2.5s, so this leaves room for several attempts.
const DWELL_TIMEOUT_MS = 22_000;
// Once a first classified finding arrives, wait a touch longer for coverage to
// improve (the widget can stream more videos in), then resolve with the best.
const SETTLE_MS = 3_500;

type Pending = {
  asin: string;
  best: VideoCounts | null;
  // The full finding behind `best`, so callers that need price/stock (the
  // watchlist) get them alongside the counts, not just the video breakdown.
  bestFinding: ProductScanFinding | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  dwellTimer: ReturnType<typeof setTimeout> | null;
  done: boolean;
  resolve: (finding: ProductScanFinding | null) => void;
};

// Keyed by the tab we opened, so an incoming product_scan can be matched to the
// request that spawned it via sender.tab.id.
const pendingByTab = new Map<number, Pending>();

function productUrl(asin: string, marketplace: string): string {
  const host = /^amazon\./.test(marketplace) ? marketplace : "amazon.com";
  return `https://www.${host}/dp/${asin}`;
}

// A finding is "better" when it accounts for more videos: coverage improves as
// the widget streams in, so prefer the higher total.
function better(a: VideoCounts | null, b: VideoCounts): VideoCounts {
  if (!a) return b;
  return b.total >= a.total ? b : a;
}

// Open one product in a background tab, wait for its content script to emit a
// classified product_scan, and resolve with the best finding (or null on
// failure/timeout). Shared by the order video-count pass and the watchlist
// poller so the tab lifecycle lives in one place.
function captureInTab(asin: string, marketplace: string): Promise<ProductScanFinding | null> {
  return chrome.tabs
    .create({ url: productUrl(asin, marketplace), active: false })
    .then((tab) => {
      const tabId = tab.id;
      if (typeof tabId !== "number") return null;
      return new Promise<ProductScanFinding | null>((resolve) => {
        const pending: Pending = {
          asin,
          best: null,
          bestFinding: null,
          settleTimer: null,
          dwellTimer: null,
          done: false,
          resolve,
        };
        pending.dwellTimer = setTimeout(() => finish(tabId), DWELL_TIMEOUT_MS);
        pendingByTab.set(tabId, pending);
      });
    })
    .catch((error) => {
      log("order-video-scan", `could not open tab for ${asin}`, error);
      return null;
    });
}

export async function scanAsinInTab(asin: string, marketplace: string): Promise<ScanAsinResult> {
  const finding = await captureInTab(asin, marketplace);
  return { counts: finding?.counts ?? null, classified: finding !== null };
}

// Watchlist variant: the same tab scan, but returning the fields a change alert
// diffs on (stock, influencer video count, price) rather than just the counts.
export async function scanProductInTab(
  asin: string,
  marketplace: string,
): Promise<ProductSnapshotResult> {
  const finding = await captureInTab(asin, marketplace);
  return {
    inStock: finding?.inStock ?? null,
    influencerVideos: finding?.counts.influencer ?? null,
    priceCents: finding?.priceCents ?? null,
  };
}

// Called from the RECORD_FINDING handler for every product_scan finding, with
// the id of the tab it came from. A finding only exists when the page could
// classify the carousel (emitProductScan skips the "no carousel" case), so any
// finding we receive here is a real breakdown.
export function noteScanFinding(finding: Finding, tabId: number | undefined): void {
  if (finding.type !== "product_scan" || typeof tabId !== "number") return;
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done) return;
  if (finding.asin.toUpperCase() !== pending.asin.toUpperCase()) return;

  const chosen = better(pending.best, finding.counts);
  if (chosen !== pending.best) {
    pending.best = chosen;
    pending.bestFinding = finding;
  }
  if (pending.settleTimer === null) {
    pending.settleTimer = setTimeout(() => finish(tabId), SETTLE_MS);
  }
}

function finish(tabId: number): void {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  pendingByTab.delete(tabId);
  if (pending.settleTimer) clearTimeout(pending.settleTimer);
  if (pending.dwellTimer) clearTimeout(pending.dwellTimer);
  void chrome.tabs.remove(tabId).catch(() => {
    // tab may already be gone (user closed it, or navigation removed it)
  });
  pending.resolve(pending.bestFinding);
}

// The products to run the count over: the account's synced order history. Read
// with the license key from the same endpoint the dashboard uses, deduped to
// one entry per ASIN (the same product bought twice is one product to scan).
export async function getOrderAsins(): Promise<OrderAsinsResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return { ok: false, items: [], error: "not_signed_in" };

  let res: Response;
  try {
    res = await fetch(`${ENDPOINTS.orders}?limit=500`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (error) {
    log("order-video-scan", "order list fetch failed", error);
    return { ok: false, items: [], error: "network" };
  }
  if (!res.ok) return { ok: false, items: [], error: `http_${res.status}` };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, items: [], error: "bad_json" };
  }
  const rows = (body as { orders?: unknown }).orders;
  if (!Array.isArray(rows)) return { ok: true, items: [] };

  const seen = new Set<string>();
  const items: OrderAsinItem[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const asin = typeof row.asin === "string" ? row.asin.toUpperCase() : "";
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    items.push({
      asin,
      marketplace: typeof row.marketplace === "string" ? row.marketplace : "amazon.com",
      title: typeof row.title === "string" ? row.title : null,
    });
  }
  return { ok: true, items };
}
