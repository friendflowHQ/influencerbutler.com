import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { parseStoreTiles, type StoreTile } from "../../amazon/brand-store";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import type { DpStaticSignals } from "../../amazon/dp-static";
import { getRateCard, type StoredRateCard } from "../../rate-card/cache";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { resolveRatePct } from "../score/rate";
import { computeButlerScore, type ButlerScore } from "../score/model";
import { formatCents } from "../calculator/model";
import { getState } from "../../storage/store";
import { SCAN_CACHE_TTL_MS } from "../../shared/constants";
import { query } from "../../amazon/selectors";
import {
  sendToBackground,
  type EarningsLookupResult,
  type ScanAsinResult,
  type WatchlistResult,
} from "../../shared/messages";
import { enrichStoreTiles } from "./enrich";
import { pickGreenBox, type GreenBoxInput } from "./select";
import { renderStoreToolbar, type StoreToolbar } from "./toolbar";
import type { Settings } from "../../storage/schema";

// Brand-store research overlay: badges every product tile on a /stores/ page
// with the signals a creator weighs before filming a shoppable review video,
// then outlines the strongest candidates in green. Fully automatic, in three
// tiers: instant tile data, a paced cache-first fetch of each product page
// (upper-carousel slot, total videos, category rate, demand, stock), then the
// background-tab scan for the influencer video split. See select.ts for the
// green-box rule.

// Marks a tile as already decorated so a React rebuild does not double-badge.
const DONE_ATTR = "data-ib-store";
// The Tier-2 scan opens one background tab per product; cap a single page run.
const SCAN_CAP = 20;
// The React store may render the grid after document_idle: poll briefly.
const GRID_WAIT_MS = 500;
const GRID_WAIT_TRIES = 30;
const GREEN_OUTLINE = "2px solid #22c55e";

type Row = {
  tile: StoreTile;
  marketplace: string;
  ratePct: number;
  commissionCents: number | null;
  flags: { cc: boolean; spcc: boolean };
  dp: DpStaticSignals | null;
  influencerVideos: number | null;
  scanned: boolean;
  score: ButlerScore;
  badgeBody: HTMLElement;
  showWatch: boolean;
  watched: boolean;
  provenEarner: boolean;
  boxed: boolean;
};

// One live run per page view: aborting the controller stops the enrichment
// fetches, and the stop flag halts the tab scan between products.
let controller: AbortController | null = null;
let gridObserver: MutationObserver | null = null;
let stopRequested = false;

export async function initStoreOverlay(settings: Settings): Promise<void> {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  gridObserver?.disconnect();
  gridObserver = null;
  stopRequested = false;
  for (const host of Array.from(
    document.querySelectorAll(".store-toolbar-host, .store-badge-host"),
  )) {
    host.remove();
  }
  for (const tile of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    tile.removeAttribute(DONE_ATTR);
    setHighlight(tile as HTMLElement, false);
  }

  // Stop only halts the automatic fetch/scan passes; the badges and the
  // re-render observer stay alive for the rest of the page view, so `run`
  // (page lifetime) and `scan` (stoppable work) are separate controllers.
  const scan = new AbortController();
  run.signal.addEventListener("abort", () => scan.abort(), { once: true });

  const tiles = await waitForTiles(run.signal);
  if (run.signal.aborted || tiles.length === 0) return;

  const marketplace = marketplaceFromUrl(location.href);
  const [card, cache] = await Promise.all([getRateCard(), getCache()]);
  if (run.signal.aborted) return;
  const loaded = loadFilters(cache);
  const defaultRate = resolveRatePct({
    liveRatePct: null,
    category: null,
    card,
    defaultRatePct: settings.commissionRatePct,
  });

  const rows: Row[] = [];
  let candidatesOnly = false;

  const buildRow = (tile: StoreTile): Row => {
    tile.el.setAttribute(DONE_ATTR, "1");
    const flags = membership(loaded, tile.asin);
    const row: Row = {
      tile,
      marketplace,
      ratePct: defaultRate,
      commissionCents:
        tile.priceCents !== null ? Math.round((tile.priceCents * defaultRate) / 100) : null,
      flags: { cc: flags.cc, spcc: flags.spcc },
      dp: null,
      influencerVideos: null,
      scanned: false,
      score: { score: 0, band: "cool", parts: { commission: 0, slot: 0, demand: 0, availability: 0, price: 0, campaign: 0 } },
      badgeBody: el("div", "tile-badge-body"),
      showWatch: settings.tools.watchlist,
      watched: false,
      provenEarner: false,
      boxed: false,
    };
    row.score = scoreFor(row, settings);
    mountBadge(tile, row.badgeBody);
    renderBadge(row);
    return row;
  };

  for (const tile of tiles) rows.push(buildRow(tile));

  const applyFilter = (): void => {
    for (const row of rows) {
      row.tile.el.style.display = candidatesOnly && !row.boxed ? "none" : "";
    }
  };

  const applyGreenBoxes = (): void => {
    const picked = pickGreenBox(rows.map(greenBoxInput));
    for (const row of rows) {
      const boxed = picked.has(row.tile.asin);
      if (boxed !== row.boxed) {
        row.boxed = boxed;
        setHighlight(row.tile.el, boxed);
      }
    }
    toolbar.setCandidates(picked.size);
    if (candidatesOnly) applyFilter();
  };

  const toolbar: StoreToolbar = renderStoreToolbar({
    count: rows.length,
    onFilter: (on) => {
      candidatesOnly = on;
      applyFilter();
    },
    onStop: () => {
      stopRequested = true;
      scan.abort();
      toolbar.setRunning(false);
      toolbar.setStatus(t().sfStopped);
    },
  });
  mountToolbar(toolbar.host);
  toolbar.setRunning(true);

  // Watchlist membership + proven-earner tint, one round trip each. Both
  // no-op instantly for users without the feature or the paired app.
  if (settings.tools.watchlist) {
    void sendToBackground<WatchlistResult>({ kind: "GET_WATCHLIST" }).then((res) => {
      const watched = new Set(res.items.map((w) => w.asin.toUpperCase()));
      for (const row of rows) {
        if (watched.has(row.tile.asin)) {
          row.watched = true;
          renderBadge(row);
        }
      }
    });
  }
  void sendToBackground<EarningsLookupResult>({
    kind: "LOOKUP_EARNINGS",
    asins: rows.map((r) => r.tile.asin),
  }).then((res) => {
    if (!res.ok) return;
    const earners = new Set(
      res.results.filter((r) => r.hasEarnings).map((r) => r.asin.toUpperCase()),
    );
    for (const row of rows) {
      if (earners.has(row.tile.asin.toUpperCase())) {
        row.provenEarner = true;
        renderBadge(row);
      }
    }
  });

  // React re-renders (lazy rows, tab-internal refreshes) drop our badges and
  // inline outlines with the replaced nodes. Re-decorate anything new and
  // re-attach rows whose element went stale, matched by ASIN.
  watchGridRerenders(rows, buildRow, applyGreenBoxes, run.signal);

  // Tier 1: static product-page signals, cache-first, strictly paced.
  const onDp = (asin: string, signals: DpStaticSignals | null): void => {
    const row = rows.find((r) => r.tile.asin === asin);
    if (!row || signals === null) return;
    row.dp = signals;
    const category = signals.category ?? signals.bestsellerRank?.category ?? null;
    row.ratePct = resolveRatePct({
      liveRatePct: null,
      category,
      card,
      defaultRatePct: settings.commissionRatePct,
    });
    row.commissionCents =
      row.tile.priceCents !== null
        ? Math.round((row.tile.priceCents * row.ratePct) / 100)
        : null;
    // A page with no video carousel at all cannot have influencer videos.
    if (!signals.upperCarousel && !signals.lowerCarousel && !signals.totalVideos) {
      row.influencerVideos = 0;
      row.scanned = true;
    }
    row.score = scoreFor(row, settings);
    renderBadge(row);
    applyGreenBoxes();
  };

  const { blocked } = await enrichStoreTiles({
    asins: rows.map((r) => r.tile.asin),
    origin: location.origin,
    marketplace,
    signal: scan.signal,
    onResult: (o) => onDp(o.asin, o.signals),
    onProgress: (done, total) => {
      if (total > 0 && !stopRequested) toolbar.setStatus(t().storeEnriching(done, total));
    },
  });
  if (run.signal.aborted || stopRequested) return;
  if (blocked) {
    toolbar.setRunning(false);
    toolbar.setStatus(t().storeEnrichPaused);
    return;
  }

  // Tier 2: influencer split via the background-tab scan, best-scored first.
  // The 7-day scan cache covers products the user (or a prior run) already
  // opened, so only genuinely unknown products cost a tab.
  const scanCache = (await getState()).cache;
  if (run.signal.aborted) return;
  for (const row of rows) {
    if (row.scanned) continue;
    const hit = scanCache[`${marketplace}:${row.tile.asin}`];
    if (hit && Date.now() - hit.ts < SCAN_CACHE_TTL_MS) {
      row.influencerVideos = hit.counts.influencer;
      row.scanned = true;
      row.score = scoreFor(row, settings);
      renderBadge(row);
    }
  }
  applyGreenBoxes();

  const targets = rows
    .filter((r) => !r.scanned)
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, SCAN_CAP);
  let done = 0;
  for (const row of targets) {
    if (stopRequested || run.signal.aborted) break;
    toolbar.setStatus(t().searchScanning(done + 1, targets.length));
    row.scanned = true;
    try {
      const result = await sendToBackground<ScanAsinResult>({
        kind: "SCAN_ASIN_IN_TAB",
        asin: row.tile.asin,
        marketplace,
      });
      if (result.classified && result.counts) {
        row.influencerVideos = result.counts.influencer;
        row.score = scoreFor(row, settings);
        renderBadge(row);
        applyGreenBoxes();
      }
    } catch (error) {
      log("store-overlay", `scan failed for ${row.tile.asin}`, error);
    }
    done += 1;
  }
  toolbar.setRunning(false);
  if (!stopRequested) toolbar.setStatus(t().searchScanDone(done));
}

// The store is client-rendered; at document_idle the grid may not exist yet.
async function waitForTiles(signal: AbortSignal): Promise<StoreTile[]> {
  for (let i = 0; i < GRID_WAIT_TRIES; i += 1) {
    if (signal.aborted) return [];
    const tiles = parseStoreTiles(document, location.href).filter(
      (tile) => !tile.el.getAttribute(DONE_ATTR),
    );
    if (tiles.length > 0) return tiles;
    await new Promise((resolve) => setTimeout(resolve, GRID_WAIT_MS));
  }
  return [];
}

function greenBoxInput(row: Row): GreenBoxInput {
  return {
    asin: row.tile.asin,
    score: row.score.score,
    band: row.score.band,
    upperCarousel: row.dp ? row.dp.upperCarousel : null,
    inStock: row.dp ? row.dp.inStock : null,
  };
}

function scoreFor(row: Row, settings: Settings): ButlerScore {
  return computeButlerScore(
    {
      priceCents: row.tile.priceCents,
      commissionRatePct: row.ratePct,
      influencerVideos: row.influencerVideos,
      boughtPastMonth: row.dp?.boughtPastMonth ?? null,
      reviewCount: null,
      inStock: row.dp ? row.dp.inStock : null,
      membership: { cc: row.flags.cc, spcc: row.flags.spcc },
    },
    settings,
  );
}

function setHighlight(el: HTMLElement, on: boolean): void {
  if (on) {
    el.style.outline = GREEN_OUTLINE;
    el.style.outlineOffset = "2px";
    el.style.borderRadius = "10px";
  } else {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.borderRadius = "";
  }
}

function mountBadge(tile: StoreTile, body: HTMLElement): void {
  const { host, root } = createInlineShadow("store-badge-host");
  const wrap = el("div", "tile-badge");
  wrap.append(body);
  root.append(wrap);
  tile.el.append(host);
}

function renderBadge(row: Row): void {
  const body = row.badgeBody;
  body.replaceChildren();
  body.append(el("span", `tile-score ${row.score.band}`, String(row.score.score)));
  if (row.provenEarner) {
    body.append(el("span", "tile-chip good", t().tileProvenEarner));
  }
  if (row.commissionCents !== null) {
    body.append(
      el(
        "span",
        "tile-chip",
        t().tileCommission(formatCents(row.commissionCents, row.tile.currency)),
      ),
    );
  }
  if (row.flags.cc || row.flags.spcc) {
    body.append(el("span", "tile-chip good", t().tileCampaign));
  }
  if (row.dp) {
    if (row.dp.upperCarousel) {
      body.append(el("span", "tile-chip good", t().tileHeroSlot));
    } else if (!row.dp.lowerCarousel && !row.dp.totalVideos) {
      body.append(el("span", "tile-chip bad", t().tileNoCarousel));
    }
    if (row.dp.totalVideos !== null) {
      body.append(el("span", "tile-chip", t().tileVideos(row.dp.totalVideos)));
    }
  }
  if (row.influencerVideos !== null) {
    body.append(el("span", "tile-chip", t().tileInfluencer(row.influencerVideos)));
  }
  if (row.showWatch) body.append(watchControl(row));
}

// A small watch toggle on the tile, same as the search overlay's. Stops
// propagation so it never activates the tile's own overlay link.
function watchControl(row: Row): HTMLElement {
  const btn = el("button", `tile-watch${row.watched ? " on" : ""}`);
  btn.type = "button";
  btn.textContent = row.watched
    ? `${t().watchStar} ${t().watchOn}`
    : `${t().watchStar} ${t().watchAddShort}`;
  btn.title = row.watched ? t().watchRemove : t().watchAdd;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    btn.disabled = true;
    const done = (res: WatchlistResult): void => {
      btn.disabled = false;
      if (!row.watched && res.atCap) return;
      row.watched = !row.watched;
      renderBadge(row);
    };
    if (row.watched) {
      void sendToBackground<WatchlistResult>({
        kind: "REMOVE_FROM_WATCHLIST",
        asin: row.tile.asin,
        marketplace: row.marketplace,
      }).then(done);
    } else {
      void sendToBackground<WatchlistResult>({
        kind: "ADD_TO_WATCHLIST",
        item: { asin: row.tile.asin, marketplace: row.marketplace, title: row.tile.title },
      }).then(done);
    }
  });
  return btn;
}

function mountToolbar(host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  const grid = query(document, "storeGrid");
  const slot = grid?.parentElement ?? null;
  if (grid && slot) {
    slot.insertBefore(host, grid);
  } else {
    document.body.prepend(host);
  }
}

// Watch the grid for React re-renders. New tiles (lazy rows) get decorated
// and Tier-0 data; tiles whose element was swapped get their badge remounted
// and outline re-applied. Debounced so a render burst costs one pass.
function watchGridRerenders(
  rows: Row[],
  buildRow: (tile: StoreTile) => Row,
  applyGreenBoxes: () => void,
  signal: AbortSignal,
): void {
  const grid = query(document, "storeGrid");
  if (!grid) return;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (signal.aborted) return;
      const byAsin = new Map(rows.map((r) => [r.tile.asin, r]));
      for (const tile of parseStoreTiles(document, location.href)) {
        if (tile.el.getAttribute(DONE_ATTR)) continue;
        const existing = byAsin.get(tile.asin);
        if (existing) {
          // Same product, replaced node: re-attach badge and outline.
          existing.tile = tile;
          tile.el.setAttribute(DONE_ATTR, "1");
          mountBadge(tile, existing.badgeBody);
          renderBadge(existing);
          setHighlight(tile.el, existing.boxed);
        } else {
          rows.push(buildRow(tile));
        }
      }
      applyGreenBoxes();
    }, 500);
  });
  observer.observe(grid, { childList: true, subtree: true });
  gridObserver = observer;
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
