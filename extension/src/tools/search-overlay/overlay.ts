import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { parseSearchTiles, type SearchTile } from "../../amazon/search-results";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { getRateCard } from "../../rate-card/cache";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { resolveRatePct } from "../score/rate";
import { computeButlerScore, type ButlerScore } from "../score/model";
import { formatCents } from "../calculator/model";
import { sendToBackground, type ScanAsinResult, type WatchlistResult } from "../../shared/messages";
import { renderToolbar, type FilterState, type SortKey } from "./toolbar";
import type { Settings } from "../../storage/schema";

// Marks a tile as already decorated so an SPA rebuild does not double-badge it.
const DONE_ATTR = "data-ib-search";
// The video scan opens one background tab per product; cap it so a click never
// spawns dozens of tabs. The rest keep their local-only badge.
const SCAN_CAP = 20;

type Row = {
  tile: SearchTile;
  order: number;
  marketplace: string;
  ratePct: number;
  commissionCents: number | null;
  flags: { cc: boolean; spcc: boolean };
  influencerVideos: number | null;
  // True once a video scan has been attempted for this tile (success or not),
  // so repeated Scan clicks advance to the next unscanned batch instead of
  // re-scanning the same top rows and silently ignoring the rest of the page.
  scanned: boolean;
  score: ButlerScore;
  badgeBody: HTMLElement;
  showWatch: boolean;
  watched: boolean;
};

let stopScan = false;

export async function initSearchOverlay(settings: Settings): Promise<void> {
  // Amazon rewrites the URL when the user applies an in-page filter/sort, which
  // re-triggers this run. Tear down the prior overlay (toolbar + tile badges)
  // and clear the done-markers so we rebuild cleanly over the current grid
  // instead of leaving a stale toolbar and double-badging.
  for (const host of Array.from(
    document.querySelectorAll(".search-toolbar-host, .tile-badge-host"),
  )) {
    host.remove();
  }
  for (const tile of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    tile.removeAttribute(DONE_ATTR);
  }

  const marketplace = marketplaceFromUrl(location.href);
  const tiles = parseSearchTiles(document, location.href).filter((tile) => {
    if (tile.el.getAttribute(DONE_ATTR)) return false;
    tile.el.setAttribute(DONE_ATTR, "1");
    return true;
  });
  if (tiles.length === 0) return;

  const [card, cache] = await Promise.all([getRateCard(), getCache()]);
  const loaded = loadFilters(cache);
  const defaultRate = resolveRatePct({
    liveRatePct: null,
    category: null,
    card,
    defaultRatePct: settings.commissionRatePct,
  });

  const rows: Row[] = tiles.map((tile, i) => {
    const flags = membership(loaded, tile.asin);
    const commissionCents =
      tile.priceCents !== null ? Math.round((tile.priceCents * defaultRate) / 100) : null;
    const badgeBody = el("div", "tile-badge-body");
    const row: Row = {
      tile,
      order: i,
      marketplace,
      ratePct: defaultRate,
      commissionCents,
      flags: { cc: flags.cc, spcc: flags.spcc },
      influencerVideos: null,
      scanned: false,
      score: scoreFor(tile, defaultRate, flags, null, settings),
      badgeBody,
      showWatch: settings.tools.watchlist,
      watched: false,
    };
    mountBadge(tile, badgeBody);
    renderBadge(row);
    return row;
  });

  // Mark which tiles are already on the watchlist in one round trip, then
  // repaint their badges so the Watch control reflects state.
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

  // Anchor after the last tile so reordering stays within the results block and
  // never drags a tile past pagination or a footer.
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return;
  const parent = first.tile.el.parentElement;
  const anchor = document.createComment("ib-search-anchor");
  last.tile.el.after(anchor);

  const applySort = (key: SortKey): void => {
    if (!parent) return;
    const sorted = [...rows].sort(comparator(key));
    for (const row of sorted) parent.insertBefore(row.tile.el, anchor);
  };

  const applyFilter = (state: FilterState): void => {
    for (const row of rows) {
      const failsCampaign = state.campaignOnly && !(row.flags.cc || row.flags.spcc);
      const failsPrice =
        state.minPriceCents !== null &&
        (row.tile.priceCents === null || row.tile.priceCents < state.minPriceCents);
      row.tile.el.style.display = failsCampaign || failsPrice ? "none" : "";
    }
  };

  const runScan = async (setStatus: (text: string) => void): Promise<void> => {
    stopScan = false;
    // Scan the next batch of not-yet-scanned visible rows, best-scored first, up
    // to the cap. The scan opens a background tab per product, so the per-run cap
    // keeps one click from spawning dozens of tabs; clicking Scan again advances
    // to the next batch rather than silently leaving the rest of the page unscored.
    const pending = [...rows]
      .filter((r) => r.tile.el.style.display !== "none" && !r.scanned)
      .sort(comparator("score"));
    const targets = pending.slice(0, SCAN_CAP);
    let done = 0;
    for (const row of targets) {
      if (stopScan) break;
      setStatus(t().searchScanning(done + 1, targets.length));
      row.scanned = true;
      try {
        const result = await sendToBackground<ScanAsinResult>({
          kind: "SCAN_ASIN_IN_TAB",
          asin: row.tile.asin,
          marketplace,
        });
        if (result.classified && result.counts) {
          row.influencerVideos = result.counts.influencer;
          row.score = scoreFor(row.tile, row.ratePct, row.flags, row.influencerVideos, settings);
          renderBadge(row);
        }
      } catch (error) {
        log("search-overlay", `scan failed for ${row.tile.asin}`, error);
      }
      done += 1;
    }
    // How many visible rows are still unscanned (either beyond this batch's cap,
    // or skipped because the user hit Stop) so the user knows more can be scored.
    const remaining = rows.filter(
      (r) => r.tile.el.style.display !== "none" && !r.scanned,
    ).length;
    setStatus(remaining > 0 ? t().searchScanMore(done, remaining) : t().searchScanDone(done));
  };

  const toolbarHost = renderToolbar({
    count: rows.length,
    onSort: applySort,
    onFilter: applyFilter,
    onScanStart: runScan,
    onScanStop: () => {
      stopScan = true;
    },
  });

  mountToolbar(first.tile.el, toolbarHost);
  // Lead with the best opportunities.
  applySort("score");
}

function scoreFor(
  tile: SearchTile,
  ratePct: number,
  flags: { cc: boolean; spcc: boolean },
  influencerVideos: number | null,
  settings: Settings,
): ButlerScore {
  return computeButlerScore(
    {
      priceCents: tile.priceCents,
      commissionRatePct: ratePct,
      influencerVideos,
      boughtPastMonth: tile.boughtPastMonth,
      inStock: null,
      membership: { cc: flags.cc, spcc: flags.spcc },
    },
    settings,
  );
}

function comparator(key: SortKey): (a: Row, b: Row) => number {
  switch (key) {
    case "score":
      return (a, b) => b.score.score - a.score.score;
    case "commission":
      return (a, b) => (b.commissionCents ?? -1) - (a.commissionCents ?? -1);
    case "price-asc":
      return (a, b) => (a.tile.priceCents ?? Infinity) - (b.tile.priceCents ?? Infinity);
    case "price-desc":
      return (a, b) => (b.tile.priceCents ?? -1) - (a.tile.priceCents ?? -1);
    case "relevance":
      return (a, b) => a.order - b.order;
  }
}

function mountBadge(tile: SearchTile, body: HTMLElement): void {
  const { host, root } = createInlineShadow("tile-badge-host");
  const wrap = el("div", "tile-badge");
  wrap.append(body);
  root.append(wrap);
  tile.el.append(host);
}

function renderBadge(row: Row): void {
  const body = row.badgeBody;
  body.replaceChildren();
  body.append(el("span", `tile-score ${row.score.band}`, String(row.score.score)));
  if (row.commissionCents !== null) {
    body.append(
      el("span", "tile-chip", t().tileCommission(formatCents(row.commissionCents, row.tile.currency))),
    );
  }
  if (row.flags.cc || row.flags.spcc) {
    body.append(el("span", "tile-chip good", t().tileCampaign));
  }
  if (row.influencerVideos !== null) {
    body.append(el("span", "tile-chip", t().tileInfluencer(row.influencerVideos)));
  }
  if (row.showWatch) body.append(watchControl(row));
}

// A small watch toggle on the tile: a star that flips membership without
// leaving the search page. Stops propagation so it never activates the tile's
// own product link.
function watchControl(row: Row): HTMLElement {
  const btn = el("button", `tile-watch${row.watched ? " on" : ""}`);
  btn.type = "button";
  btn.textContent = row.watched ? `${t().watchStar} ${t().watchOn}` : `${t().watchStar} ${t().watchAddShort}`;
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

// Place the toolbar just above the whole results slot so it spans the grid.
function mountToolbar(tileEl: HTMLElement, host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  const slot = tileEl.closest(".s-main-slot") ?? tileEl.parentElement;
  if (slot && slot.parentElement) {
    slot.parentElement.insertBefore(host, slot);
  } else if (slot) {
    slot.prepend(host);
  }
}
