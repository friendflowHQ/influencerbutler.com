import { getState, patchState } from "../storage/store";
import { scanProductInTab } from "./order-video-scan";
import { log } from "../shared/log";
import { WATCHLIST_RUN_CAP } from "../shared/constants";
import { WATCHLIST_CAP, type WatchItem, type WatchCondition } from "../storage/schema";
import { t } from "../i18n";
import type {
  ProductSnapshotResult,
  WatchInput,
  WatchlistResult,
} from "../shared/messages";

// ASIN watchlist: the store operations plus the background change poller.
//
// The user pins a product from the product page, a search tile, or the popup.
// On the WATCHLIST_ALARM the poller opens a small batch (least-recently checked
// first) in background tabs, reads the current stock / influencer video count /
// price, and fires a notification when a subscribed condition trips against the
// last check. Each item's `last` is persisted right after its check, so a
// worker killed mid-run loses no progress and the next alarm picks up the rest.

const ALL_CONDITIONS: WatchCondition[] = ["back_in_stock", "slot_opens", "price_drop"];
const NOTIF_PREFIX = "ib-watch:";

function keyOf(asin: string, marketplace: string): string {
  return `${asin.toUpperCase()}:${marketplace}`;
}

function findIndex(items: WatchItem[], asin: string, marketplace: string): number {
  const key = keyOf(asin, marketplace);
  return items.findIndex((w) => keyOf(w.asin, w.marketplace) === key);
}

export async function getWatchlist(): Promise<WatchlistResult> {
  return { items: (await getState()).watchlist };
}

export async function isWatched(asin: string, marketplace: string): Promise<boolean> {
  const { watchlist } = await getState();
  return findIndex(watchlist, asin, marketplace) >= 0;
}

export async function addToWatchlist(input: WatchInput): Promise<WatchlistResult> {
  const asin = input.asin.toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return getWatchlist();
  let atCap = false;
  const state = await patchState((s) => {
    if (findIndex(s.watchlist, asin, input.marketplace) >= 0) return; // already watching
    if (s.watchlist.length >= WATCHLIST_CAP) {
      atCap = true;
      return;
    }
    const notifyOn =
      input.notifyOn && input.notifyOn.length > 0 ? input.notifyOn : [...ALL_CONDITIONS];
    s.watchlist.push({
      asin,
      marketplace: input.marketplace,
      title: input.title,
      imageUrl: input.imageUrl ?? null,
      addedAt: Date.now(),
      notifyOn,
      last: null,
    });
  });
  return { items: state.watchlist, atCap };
}

export async function removeFromWatchlist(
  asin: string,
  marketplace: string,
): Promise<WatchlistResult> {
  const state = await patchState((s) => {
    const idx = findIndex(s.watchlist, asin, marketplace);
    if (idx >= 0) s.watchlist.splice(idx, 1);
  });
  return { items: state.watchlist };
}

export async function setWatchConditions(
  asin: string,
  marketplace: string,
  notifyOn: WatchCondition[],
): Promise<WatchlistResult> {
  const clean = ALL_CONDITIONS.filter((c) => notifyOn.includes(c));
  const state = await patchState((s) => {
    const item = s.watchlist[findIndex(s.watchlist, asin, marketplace)];
    if (item) item.notifyOn = clean;
  });
  return { items: state.watchlist };
}

// Fill in an item's image/title once, from the Creator API lookup the popup
// runs on open. Only nulls are written, so a real title captured at add time is
// never clobbered by a later (possibly emptier) enrichment.
export async function backfillWatchItem(
  asin: string,
  marketplace: string,
  patch: { imageUrl?: string | null; title?: string | null },
): Promise<void> {
  await patchState((s) => {
    const item = s.watchlist[findIndex(s.watchlist, asin, marketplace)];
    if (!item) return;
    if (!item.imageUrl && patch.imageUrl) item.imageUrl = patch.imageUrl;
    if (!item.title && patch.title) item.title = patch.title;
  });
}

// Alarm handler: check up to WATCHLIST_RUN_CAP items, least-recently checked
// first, one at a time so the worker opens a single background tab at a time.
export async function refreshWatchlist(): Promise<void> {
  const state = await getState();
  if (!state.settings.tools.watchlist || state.watchlist.length === 0) return;

  const due = [...state.watchlist]
    .sort((a, b) => (a.last?.checkedAt ?? 0) - (b.last?.checkedAt ?? 0))
    .slice(0, WATCHLIST_RUN_CAP);

  for (const item of due) {
    let snapshot: ProductSnapshotResult;
    try {
      snapshot = await scanProductInTab(item.asin, item.marketplace);
    } catch (error) {
      log("watchlist", `check failed for ${item.asin}`, error);
      continue;
    }
    await applySnapshot(item.asin, item.marketplace, snapshot);
  }
}

// Diff a fresh snapshot against the stored `last`, fire notifications for any
// subscribed condition that tripped, and persist the new snapshot. Reads state
// fresh so a concurrent add/remove is respected.
async function applySnapshot(
  asin: string,
  marketplace: string,
  snapshot: ProductSnapshotResult,
): Promise<void> {
  let fired: WatchCondition[] = [];
  let title: string | null = null;
  await patchState((s) => {
    const item = s.watchlist[findIndex(s.watchlist, asin, marketplace)];
    if (!item) return;
    title = item.title;
    // First check just records a baseline; a change needs something to diff.
    if (item.last) fired = triggered(item.last, snapshot, item.notifyOn);
    item.last = {
      inStock: snapshot.inStock,
      influencerVideos: snapshot.influencerVideos,
      priceCents: snapshot.priceCents,
      checkedAt: Date.now(),
    };
  });

  for (const condition of fired) {
    notify(asin, marketplace, condition, title, snapshot);
  }
}

// Pure trigger check: which subscribed conditions changed for the better.
export function triggered(
  last: NonNullable<WatchItem["last"]>,
  now: ProductSnapshotResult,
  notifyOn: WatchCondition[],
): WatchCondition[] {
  const fired: WatchCondition[] = [];
  if (
    notifyOn.includes("back_in_stock") &&
    last.inStock === false &&
    now.inStock === true
  ) {
    fired.push("back_in_stock");
  }
  if (
    notifyOn.includes("slot_opens") &&
    last.influencerVideos !== null &&
    now.influencerVideos !== null &&
    now.influencerVideos < last.influencerVideos
  ) {
    fired.push("slot_opens");
  }
  if (
    notifyOn.includes("price_drop") &&
    last.priceCents !== null &&
    now.priceCents !== null &&
    now.priceCents < last.priceCents
  ) {
    fired.push("price_drop");
  }
  return fired;
}

function notify(
  asin: string,
  marketplace: string,
  condition: WatchCondition,
  title: string | null,
  snapshot: ProductSnapshotResult,
): void {
  const name = title ?? asin;
  const message =
    condition === "back_in_stock"
      ? t().watchNotifBackInStock(name)
      : condition === "slot_opens"
        ? t().watchNotifSlotOpens(name, snapshot.influencerVideos ?? 0)
        : t().watchNotifPriceDrop(name);
  try {
    chrome.notifications.create(`${NOTIF_PREFIX}${marketplace}:${asin}:${condition}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: t().watchNotifTitle,
      message,
    });
  } catch (error) {
    log("watchlist", "could not create notification", error);
  }
}

// A watchlist notification was clicked: open the product. The URL is rebuilt
// from the validated id, so this never opens an arbitrary destination.
export function handleWatchNotificationClick(notificationId: string): boolean {
  if (!notificationId.startsWith(NOTIF_PREFIX)) return false;
  const rest = notificationId.slice(NOTIF_PREFIX.length);
  const [marketplace, asin] = rest.split(":");
  if (!marketplace || !asin || !/^[A-Z0-9]{10}$/.test(asin) || !/^amazon\./.test(marketplace)) {
    return true;
  }
  void chrome.tabs.create({ url: `https://www.${marketplace}/dp/${asin}` });
  return true;
}
