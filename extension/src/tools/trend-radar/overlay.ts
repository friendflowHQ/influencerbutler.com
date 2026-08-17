import { el } from "../../ui/components";
import { createInlineShadow } from "../../ui/host";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { parseDiscoveryTiles, type DiscoveryTile } from "../../amazon/discovery-tiles";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { getRateCard } from "../../rate-card/cache";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { resolveRatePct } from "../score/rate";
import { computeButlerScore, type ButlerScore } from "../score/model";
import { formatCents } from "../calculator/model";
import { query } from "../../amazon/selectors";
import {
  sendToBackground,
  type EarningsLookupResult,
  type ScanAsinResult,
  type WatchlistResult,
} from "../../shared/messages";
import { renderTrendToolbar, type TrendFilterState, type TrendSortKey } from "./toolbar";
import type { Settings } from "../../storage/schema";

// Trend Radar: the extension's one proactive-discovery surface. Every other tool
// evaluates a product the creator already found; this one scores Amazon's own
// Best Sellers / New Releases / Movers & Shakers grids so a creator can catch a
// rising product before the niche fills with videos. It reuses the search
// overlay's model (instant tile scoring, opt-in paced video scan) and adds two
// discovery-only signals: the Best Sellers rank and the 24h sales-rank gain.

const DONE_ATTR = "data-ib-trend";
// The video scan opens one background tab per product; cap a single run so a
// click never spawns dozens of tabs. Clicking Scan again advances the batch.
const SCAN_CAP = 20;
// The p13n grid can hydrate a beat after document_idle: poll briefly for tiles.
const GRID_WAIT_MS = 500;
const GRID_WAIT_TRIES = 20;

type Row = {
  tile: DiscoveryTile;
  // The element the sort moves. On the p13n grid the tile (#gridItemRoot) sits
  // inside an <li> wrapper, and it is those list items that are siblings under
  // one <ol>; moving the tile div itself would not reorder anything. Falls back
  // to the tile element when there is no list wrapper (some search-like grids).
  reorderEl: HTMLElement;
  order: number;
  marketplace: string;
  ratePct: number;
  commissionCents: number | null;
  flags: { cc: boolean; spcc: boolean };
  influencerVideos: number | null;
  scanned: boolean;
  score: ButlerScore;
  badgeBody: HTMLElement;
  showWatch: boolean;
  watched: boolean;
  provenEarner: boolean;
};

let stopScan = false;

export async function initTrendRadar(settings: Settings): Promise<void> {
  // Amazon rewrites the URL when the user changes department or page, which
  // re-triggers this run. Tear down the prior overlay and clear done-markers so
  // we rebuild cleanly over the current grid instead of double-badging.
  for (const host of Array.from(
    document.querySelectorAll(".search-toolbar-host, .tile-badge-host"),
  )) {
    host.remove();
  }
  for (const tile of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    tile.removeAttribute(DONE_ATTR);
  }

  const marketplace = marketplaceFromUrl(location.href);
  const tiles = (await waitForTiles()).filter((tile) => {
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
      reorderEl: reorderElFor(tile.el),
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
      provenEarner: false,
    };
    mountBadge(tile, badgeBody);
    renderBadge(row);
    return row;
  });

  // Mark which tiles are already watched, in one round trip, then repaint.
  if (settings.tools.watchlist) {
    void sendToBackground<WatchlistResult>({ kind: "GET_WATCHLIST" }).then((res) => {
      const watched = new Set(res.items.map((w) => w.asin.toUpperCase()));
      for (const row of rows) {
        if (watched.has(row.tile.asin.toUpperCase())) {
          row.watched = true;
          renderBadge(row);
        }
      }
    });
  }

  // "Proven earner" tint: one batched lookup against the desktop app ledger.
  // A no-op for anyone who never paired the app, so it costs nothing there.
  void sendToBackground<EarningsLookupResult>({
    kind: "LOOKUP_EARNINGS",
    asins: rows.map((r) => r.tile.asin),
  }).then((res) => {
    if (!res.ok) return;
    const earners = new Set(
      res.results.filter((r) => r.hasEarnings).map((r) => r.asin.toUpperCase()),
    );
    if (earners.size === 0) return;
    for (const row of rows) {
      if (earners.has(row.tile.asin.toUpperCase())) {
        row.provenEarner = true;
        renderBadge(row);
      }
    }
  });

  // Reorder is only safe when every tile shares one parent (the p13n grid).
  // When a page nests tiles in per-row wrappers, we keep Amazon's order and let
  // the filter (hide) do the work, rather than tear the layout apart.
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return;
  const parent = first.reorderEl.parentElement;
  const canReorder = parent !== null && rows.every((r) => r.reorderEl.parentElement === parent);
  const anchor = document.createComment("ib-trend-anchor");
  // Before the first tile, not after the last: sorted tiles pack ahead of any
  // non-row grid children, so the new order is visible at the top of the page.
  if (canReorder) first.reorderEl.before(anchor);

  const applySort = (key: TrendSortKey): void => {
    if (!canReorder || !parent) return;
    const sorted = [...rows].sort(comparator(key));
    for (const row of sorted) parent.insertBefore(row.reorderEl, anchor);
  };

  const applyFilter = (state: TrendFilterState): void => {
    for (const row of rows) {
      // "Open slot" hides only products we have confirmed are crowded; unknown
      // (unscanned) tiles stay visible so the filter never hides opportunities.
      const crowded =
        state.fewVideosOnly &&
        row.influencerVideos !== null &&
        row.influencerVideos > settings.approved.maxInfluencerVideos;
      row.reorderEl.style.display = crowded ? "none" : "";
    }
  };

  const runScan = async (setStatus: (text: string) => void): Promise<void> => {
    stopScan = false;
    const pending = [...rows]
      .filter((r) => r.reorderEl.style.display !== "none" && !r.scanned)
      .sort(comparator("trending"));
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
        log("trend-radar", `scan failed for ${row.tile.asin}`, error);
      }
      done += 1;
    }
    const remaining = rows.filter(
      (r) => r.reorderEl.style.display !== "none" && !r.scanned,
    ).length;
    setStatus(remaining > 0 ? t().searchScanMore(done, remaining) : t().searchScanDone(done));
  };

  const toolbarHost = renderTrendToolbar({
    count: rows.length,
    onSort: applySort,
    onFilter: applyFilter,
    onScanStart: runScan,
    onScanStop: () => {
      stopScan = true;
    },
  });
  mountToolbar(first.tile.el, toolbarHost);

  // Lead with what is rising fastest.
  applySort("trending");
}

// The p13n grid is mostly server-rendered but can hydrate a beat late.
async function waitForTiles(): Promise<DiscoveryTile[]> {
  for (let i = 0; i < GRID_WAIT_TRIES; i += 1) {
    const tiles = parseDiscoveryTiles(document, location.href).filter(
      (tile) => !tile.el.getAttribute(DONE_ATTR),
    );
    if (tiles.length > 0) return tiles;
    await new Promise((resolve) => setTimeout(resolve, GRID_WAIT_MS));
  }
  return [];
}

// The p13n grid nests each tile (#gridItemRoot) inside an <li> that is the
// actual sibling under the <ol> row, so the sort must move that <li>. The
// nearest list-item ancestor is that wrapper on Best Sellers / New Releases /
// Movers; when there is none (a flatter, search-like grid), the tile moves
// itself. Verified live 2026-08-11: 30 tiles share one <ol> via their <li>.
function reorderElFor(el: HTMLElement): HTMLElement {
  return (el.closest("li") as HTMLElement | null) ?? el;
}

function scoreFor(
  tile: DiscoveryTile,
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
      // A Best Sellers / Movers placement is itself a strong demand signal, so
      // a top-ranked tile with no on-tile "bought" count is not treated as
      // unknown-neutral: it reads as high demand. Rank 1 -> full, tapering out
      // by ~rank 40. Movers tiles without a rank use their DOM ordinal.
      boughtPastMonth: demandProxyFromRank(tile.rank, settings),
      reviewCount: null,
      inStock: null,
      membership: { cc: flags.cc, spcc: flags.spcc },
    },
    settings,
  );
}

// Turn a discovery rank into a "bought in past month" proxy so the shared Butler
// Score model can consume it without change. Full-demand (4x the approved floor,
// which saturates the demand component) at rank 1, linearly down to the floor by
// rank 40, and never below the floor: everything on a best-seller list clears
// the demand bar, which is the honest read.
function demandProxyFromRank(rank: number | null, settings: Settings): number | null {
  if (rank === null) return null;
  const floor = Math.max(1, settings.approved.minBoughtPerMonth);
  const top = floor * 4;
  const t = Math.min(1, Math.max(0, (40 - rank) / 39));
  return Math.round(floor + (top - floor) * t);
}

function comparator(key: TrendSortKey): (a: Row, b: Row) => number {
  switch (key) {
    case "trending":
      // Movers gain first (higher = hotter); tiles without a gain fall back to
      // rank (lower = better), so a Best Sellers page sorts by rank here.
      return (a, b) => {
        const ga = a.tile.gainPct;
        const gb = b.tile.gainPct;
        if (ga !== null || gb !== null) return (gb ?? -1) - (ga ?? -1);
        return rankValue(a) - rankValue(b);
      };
    case "rank":
      return (a, b) => rankValue(a) - rankValue(b);
    case "score":
      return (a, b) => b.score.score - a.score.score;
    case "commission":
      return (a, b) => (b.commissionCents ?? -1) - (a.commissionCents ?? -1);
  }
}

function rankValue(row: Row): number {
  return row.tile.rank ?? row.order + 1;
}

function mountBadge(tile: DiscoveryTile, body: HTMLElement): void {
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
  // The discovery-only signals lead: a fast riser or a top rank is why this
  // product is worth a look before the rest.
  if (row.tile.gainPct !== null) {
    body.append(el("span", "tile-chip good", t().tileGain(row.tile.gainPct)));
  }
  if (row.tile.rank !== null) {
    body.append(el("span", "tile-chip", t().tileRank(row.tile.rank)));
  }
  if (row.provenEarner) {
    body.append(el("span", "tile-chip good", t().tileProvenEarner));
  }
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

// A small watch toggle on the tile, same as the search/store overlays. Stops
// propagation so it never activates the tile's own product link.
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

// Place the toolbar just above the whole grid so it spans the results.
function mountToolbar(tileEl: HTMLElement, host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  const grid = query(document, "discoveryGrid");
  const slot = grid ?? tileEl.parentElement;
  if (slot && slot.parentElement) {
    slot.parentElement.insertBefore(host, slot);
  } else if (slot) {
    slot.prepend(host);
  } else {
    document.body.prepend(host);
  }
}
