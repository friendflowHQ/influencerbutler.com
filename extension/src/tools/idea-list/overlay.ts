import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { parseIdeaListTiles, type IdeaListTile } from "../../amazon/idea-list-tiles";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import type { DpStaticSignals } from "../../amazon/dp-static";
import { getRateCard } from "../../rate-card/cache";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { resolveRatePct } from "../score/rate";
import { computeButlerScore, type ButlerScore } from "../score/model";
import { formatCents, formatCompactMoney } from "../calculator/model";
import { resolveEstimate } from "../../amazon/bsr-revenue-estimator";
import { getState } from "../../storage/store";
import { SCAN_CACHE_TTL_MS } from "../../shared/constants";
import { query } from "../../amazon/selectors";
import {
  sendToBackground,
  type EarningsLookupResult,
  type WatchlistResult,
} from "../../shared/messages";
import { enrichStoreTiles } from "../store-overlay/enrich";
import { renderIdeaListToolbar, type IdeaListToolbar } from "./toolbar";
import type { Settings } from "../../storage/schema";

// Idea List money signals: badges every product on an Idea List detail page
// (/shop/<handle>/list/<LISTID>) with the Butler Score, estimated commission,
// and campaign chips, so a creator can tell at a glance which items on the
// list are worth filming. Tier 0 is instant (the page renders prices server
// side); the paced Tier 1 product-page pass then adds the video-slot, demand,
// and category-rate signals. No Tier 2 tab scan: the 7-day scan cache still
// fills the influencer split for products the user already opened.

// Marks a tile as already decorated so a re-render does not double-badge.
const DONE_ATTR = "data-ib-idealist";
// Idea lists run 10-50 products; cap the automatic product-page pass so a
// giant list cannot trickle-fetch forever. Tiles past the cap keep Tier 0.
const ENRICH_CAP = 40;
// The grid is server-rendered, but poll briefly anyway in case a layout
// variant hydrates late (same rhythm as the store overlay).
const GRID_WAIT_MS = 500;
const GRID_WAIT_TRIES = 30;

type Row = {
  tile: IdeaListTile;
  marketplace: string;
  ratePct: number;
  commissionCents: number | null;
  flags: { cc: boolean; spcc: boolean };
  dp: DpStaticSignals | null;
  influencerVideos: number | null;
  score: ButlerScore;
  badgeBody: HTMLElement;
  showWatch: boolean;
  watched: boolean;
  provenEarner: boolean;
};

// One live run per page view: `run` lives for the page view, `scan` only for
// the stoppable enrichment pass.
let controller: AbortController | null = null;
let gridObserver: MutationObserver | null = null;
let stopRequested = false;

export async function initIdeaListOverlay(settings: Settings): Promise<void> {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  gridObserver?.disconnect();
  gridObserver = null;
  stopRequested = false;
  for (const host of Array.from(
    document.querySelectorAll(".idealist-toolbar-host, .idealist-badge-host"),
  )) {
    host.remove();
  }
  for (const tile of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    tile.removeAttribute(DONE_ATTR);
  }

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

  const buildRow = (tile: IdeaListTile): Row => {
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
      score: { score: 0, band: "cool", parts: { commission: 0, slot: 0, demand: 0, availability: 0, price: 0, campaign: 0 } },
      badgeBody: el("div", "tile-badge-body"),
      showWatch: settings.tools.watchlist,
      watched: false,
      provenEarner: false,
    };
    row.score = scoreFor(row, settings);
    mountBadge(tile, row.badgeBody);
    renderBadge(row);
    return row;
  };

  for (const tile of tiles) rows.push(buildRow(tile));

  const toolbar: IdeaListToolbar = renderIdeaListToolbar({
    count: rows.length,
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

  // Re-decorate tiles a re-render replaced and pick up lazy-loaded ones.
  watchGridRerenders(rows, buildRow, run.signal);

  // The 7-day scan cache fills the influencer split for free (no tabs).
  const scanCache = (await getState()).cache;
  if (run.signal.aborted) return;
  for (const row of rows) {
    const hit = scanCache[`${marketplace}:${row.tile.asin}`];
    if (hit && Date.now() - hit.ts < SCAN_CACHE_TTL_MS) {
      row.influencerVideos = hit.counts.influencer;
      row.score = scoreFor(row, settings);
      renderBadge(row);
    }
  }

  // Tier 1: static product-page signals, cache-first, strictly paced, capped.
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
    }
    row.score = scoreFor(row, settings);
    renderBadge(row);
  };

  const { blocked } = await enrichStoreTiles({
    asins: rows.slice(0, ENRICH_CAP).map((r) => r.tile.asin),
    origin: location.origin,
    marketplace,
    signal: scan.signal,
    onResult: (o) => onDp(o.asin, o.signals),
    onProgress: (done, total) => {
      if (total > 0 && !stopRequested) toolbar.setStatus(t().storeEnriching(done, total));
    },
  });
  if (run.signal.aborted || stopRequested) return;
  toolbar.setRunning(false);
  toolbar.setStatus(blocked ? t().storeEnrichPaused : "");
}

async function waitForTiles(signal: AbortSignal): Promise<IdeaListTile[]> {
  for (let i = 0; i < GRID_WAIT_TRIES; i += 1) {
    if (signal.aborted) return [];
    const tiles = parseIdeaListTiles(document, location.href).filter(
      (tile) => !tile.el.getAttribute(DONE_ATTR),
    );
    if (tiles.length > 0) return tiles;
    await new Promise((resolve) => setTimeout(resolve, GRID_WAIT_MS));
  }
  return [];
}

function scoreFor(row: Row, settings: Settings): ButlerScore {
  return computeButlerScore(
    {
      priceCents: row.tile.priceCents,
      commissionRatePct: row.ratePct,
      influencerVideos: row.influencerVideos,
      boughtPastMonth: row.dp?.boughtPastMonth ?? null,
      inStock: row.dp ? row.dp.inStock : null,
      reviewCount: null,
      membership: { cc: row.flags.cc, spcc: row.flags.spcc },
    },
    settings,
  );
}

function mountBadge(tile: IdeaListTile, body: HTMLElement): void {
  const { host, root } = createInlineShadow("idealist-badge-host");
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
  appendEstimateChips(row, body);
  if (row.showWatch) body.append(watchControl(row));
}

// Estimated monthly units + revenue from the per-tile /dp/ enrichment BSR + the
// tile price, computed locally. Each chip appears only when its value is known.
// Honest tooltips: estimates.
function appendEstimateChips(row: Row, body: HTMLElement): void {
  const units = resolveEstimate({
    serverUnits: null,
    salesRank: row.dp?.bestsellerRank?.rank ?? null,
    priceCents: row.tile.priceCents,
    category: row.dp?.category ?? null,
    boughtPastMonth: row.dp?.boughtPastMonth ?? null,
  }).units;
  if (units === null) return;
  const unitsChip = el("span", "tile-chip", t().tileEstUnits(units.toLocaleString()));
  unitsChip.title = t().estUnitsTip;
  body.append(unitsChip);
  if (row.tile.priceCents !== null) {
    const revCents = Math.round(units * row.tile.priceCents);
    const revChip = el("span", "tile-chip", t().tileRevenue(formatCompactMoney(revCents, row.tile.currency)));
    revChip.title = t().estRevenueTip;
    body.append(revChip);
  }
}

// A small watch toggle on the tile, same as the search and store overlays'.
// Stops propagation so it never activates the tile's own product link.
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
  const grid = query(document, "ideaListGrid");
  const slot = grid?.parentElement ?? null;
  if (grid && slot) {
    slot.insertBefore(host, grid);
  } else {
    document.body.prepend(host);
  }
}

// Watch the grid for re-renders: new tiles (lazy rows) get decorated with
// Tier-0 data; tiles whose element was swapped get their badge remounted.
// Debounced so a render burst costs one pass.
function watchGridRerenders(
  rows: Row[],
  buildRow: (tile: IdeaListTile) => Row,
  signal: AbortSignal,
): void {
  const grid = query(document, "ideaListGrid") ?? rows[0]?.tile.el.parentElement;
  if (!grid) return;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (signal.aborted) return;
      const byAsin = new Map(rows.map((r) => [r.tile.asin, r]));
      for (const tile of parseIdeaListTiles(document, location.href)) {
        if (tile.el.getAttribute(DONE_ATTR)) continue;
        const existing = byAsin.get(tile.asin);
        if (existing) {
          // Same product, replaced node: re-attach the badge.
          existing.tile = tile;
          tile.el.setAttribute(DONE_ATTR, "1");
          mountBadge(tile, existing.badgeBody);
          renderBadge(existing);
        } else {
          rows.push(buildRow(tile));
        }
      }
    }, 500);
  });
  observer.observe(grid, { childList: true, subtree: true });
  gridObserver = observer;
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
