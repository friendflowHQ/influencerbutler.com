import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { queryAll } from "../../amazon/selectors";
import { type SearchTile } from "../../amazon/search-results";
import type { DpStaticSignals } from "../../amazon/dp-static";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { retailerModule, type RetailerModule } from "../../retailers/module";
import { getState } from "../../storage/store";
import { resolveRatePct } from "../score/rate";
import { computeButlerScore, type ButlerScore } from "../score/model";
import { formatCents, formatCompactMoney } from "../calculator/model";
import { evaluateTileVerdict, type TileVerdict } from "../butler-approved/tile-verdict";
import { formatMoney, tileTotals } from "../earnings-overlay/model";
import { renderEarningsDetail } from "../earnings-overlay/detail";
import type { AsinEarnings } from "../../transport/hud-commands";
import {
  sendToBackground,
  type CcRate,
  type CcRatesResult,
  type EarningsLookupResult,
  type MarketBatchResult,
  type MarketProduct,
  type ScanAsinResult,
  type WatchlistResult,
} from "../../shared/messages";
import { enrichSearchTiles } from "./enrich";
import { renderToolbar, type FilterState, type SortKey } from "./toolbar";
import { mountTileMenuButton, type HudRef } from "./tile-menu";
import type { AuthStatus } from "../../shared/messages";
import type { HudStatus } from "../../transport/hud-commands";
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
  retailer: "amazon" | "walmart";
  // Base rate: rate card by category once enrichment supplies one, else the
  // page-wide default. A known CC campaign rate overrides it (see rateFor).
  ratePct: number;
  ccRate: CcRate | null;
  commissionCents: number | null;
  flags: { cc: boolean; spcc: boolean; deals: boolean };
  influencerVideos: number | null;
  totalVideos: number | null;
  // Static product-page signals once enrichment (or the shared cache) has them.
  dp: DpStaticSignals | null;
  // inStock from a previous background-tab scan, used until dp arrives.
  cachedInStock: boolean | null;
  // True once a video scan has been attempted for this tile (success or not),
  // so repeated Scan clicks advance to the next unscanned batch instead of
  // re-scanning the same top rows and silently ignoring the rest of the page.
  scanned: boolean;
  score: ButlerScore;
  verdict: TileVerdict;
  badgeBody: HTMLElement;
  showWatch: boolean;
  watched: boolean;
  // The desktop app ledger's earnings for this ASIN, when the creator has
  // already earned on it: turns Amazon search into "find more of what already
  // paid me", with the real dollars on the chip.
  earnings: AsinEarnings | null;
  // Shared-catalogue ("internal Keepa") data for this ASIN: estimated monthly
  // sales, BSR rank/category, real bought-past-month. Null until the batched
  // GET_MARKET_BATCH returns (and stays null when the pool has nothing yet).
  market: MarketProduct | null;
  // Shared desktop-app connection state (one object for all rows). The per-tile
  // action menu reads it live when opened, so it reflects the latest bridge
  // status even though the button was mounted before GET_HUD_STATUS resolved.
  hud: HudRef;
};

let stopScan = false;

// Init epoch + abort: initSearchOverlay awaits between its teardown and its
// mounting, and Amazon rewrites the URL on every in-page filter/sort, so two
// SPA-triggered runs can interleave and both mount. Each run takes a ticket;
// after any await it bails if a newer run started, and the previous run's
// enrichment/observer dies with its AbortController.
let initEpoch = 0;
let controller: AbortController | null = null;

export async function initSearchOverlay(
  settings: Settings,
  module: RetailerModule = retailerModule("amazon"),
): Promise<void> {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  const epoch = ++initEpoch;
  const caps = module.capabilities;

  // Tear down the prior overlay (toolbar + tile badges) and clear the
  // done-markers so we rebuild cleanly over the current grid instead of
  // leaving a stale toolbar and double-badging.
  for (const host of Array.from(
    document.querySelectorAll(".search-toolbar-host, .tile-badge-host"),
  )) {
    host.remove();
  }
  for (const tile of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    tile.removeAttribute(DONE_ATTR);
  }

  const marketplace = module.marketplaceFor(location.href);
  const tiles = module.parseSearchTiles(document, location.href).filter((tile) => {
    if (tile.el.getAttribute(DONE_ATTR)) return false;
    tile.el.setAttribute(DONE_ATTR, "1");
    return true;
  });
  if (tiles.length === 0) return;

  const [card, cache, state] = await Promise.all([
    module.getRateCard(),
    caps.catalogueBloom ? getCache() : Promise.resolve(null),
    getState(),
  ]);
  if (epoch !== initEpoch) return;
  // Campaign/deal membership only exists on Amazon; Walmart tiles carry no flags.
  const loaded = cache ? loadFilters(cache) : null;
  const defaultRate = resolveRatePct({
    liveRatePct: null,
    category: null,
    card,
    defaultRatePct: module.defaultRatePct(settings),
  });

  // One shared connection object for the whole page's tile menus. Updated in
  // place when GET_HUD_STATUS / GET_AUTH_STATUS resolve below; the menus read it
  // live, so no repaint is needed when it flips.
  const hud: HudRef = { connected: false, signedIn: false };

  const rows: Row[] = tiles.map((tile, i) => {
    const flags = loaded ? membership(loaded, tile.asin) : { cc: false, spcc: false, deals: false };
    const badgeBody = el("div", "tile-badge-body");
    const row: Row = {
      tile,
      order: i,
      marketplace,
      retailer: module.retailer,
      ratePct: defaultRate,
      ccRate: null,
      commissionCents: null,
      flags: { cc: flags.cc, spcc: flags.spcc, deals: flags.deals },
      influencerVideos: null,
      totalVideos: null,
      dp: null,
      cachedInStock: null,
      scanned: false,
      score: neutralScore(settings),
      verdict: neutralVerdict(settings),
      badgeBody,
      showWatch: settings.tools.watchlist,
      watched: false,
      earnings: null,
      market: null,
      hud,
    };
    // A previous background-tab scan (from any surface) already knows this
    // product's exact influencer split; use it for free and let the Scan
    // button skip the row.
    const cachedScan = state.cache[`${marketplace}:${tile.asin}`];
    if (cachedScan) {
      row.influencerVideos = cachedScan.counts.influencer;
      row.totalVideos = cachedScan.counts.total;
      row.cachedInStock = cachedScan.inStock;
      row.scanned = true;
    }
    recompute(row, settings);
    mountBadge(tile, badgeBody);
    renderBadge(row, settings);
    return row;
  });

  // Mark which tiles are already on the watchlist in one round trip, then
  // repaint their badges so the Watch control reflects state.
  if (settings.tools.watchlist) {
    void sendToBackground<WatchlistResult>({ kind: "GET_WATCHLIST" }).then((res) => {
      if (epoch !== initEpoch) return;
      const watched = new Set(res.items.map((w) => w.asin.toUpperCase()));
      for (const row of rows) {
        if (watched.has(row.tile.asin)) {
          row.watched = true;
          renderBadge(row, settings);
        }
      }
    });
  }

  // Real earnings from the desktop app ledger, one batched lookup. Returns
  // instantly when the app was never paired, so this is a no-op for everyone
  // else. The full record is kept so the chip can show dollars and open the
  // breakdown popup. Amazon only: the desktop ledger does not track Walmart.
  if (caps.earnings) {
    void sendToBackground<EarningsLookupResult>({
      kind: "LOOKUP_EARNINGS",
      asins: rows.map((r) => r.tile.asin),
    }).then((res) => {
      if (epoch !== initEpoch || !res.ok) return;
      const byAsin = new Map(res.results.map((r) => [r.asin.toUpperCase(), r]));
      for (const row of rows) {
        const earnings = byAsin.get(row.tile.asin.toUpperCase());
        if (earnings?.hasEarnings) {
          row.earnings = earnings;
          renderBadge(row, settings);
        }
      }
    });
  }

  // Desktop-app connection + sign-in state, once for the whole page, so the
  // per-tile action menu can offer the app actions (or the upsell) without a
  // lookup per open. Updates the shared `hud` object in place; menus read it
  // live, so there is nothing to repaint.
  void Promise.all([
    sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" }),
    sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" }),
  ]).then(([hudStatus, auth]) => {
    if (epoch !== initEpoch) return;
    hud.connected = hudStatus.connected;
    hud.signedIn = auth.signedIn;
    hud.ideaLists = hudStatus.ideaLists;
  });

  // Shared-catalogue read for the whole page in one round trip: estimated
  // monthly sales/revenue + BSR rank per tile. No-op for signed-out users and
  // when the migration is unapplied (the worker returns nothing), so the tiles
  // just keep their other chips. boughtPastMonth from the pool also feeds the
  // score before the per-tile /dp/ enrichment lands.
  void sendToBackground<MarketBatchResult>({
    kind: "GET_MARKET_BATCH",
    asins: rows.map((r) => r.tile.asin),
    marketplace,
    retailer: module.retailer,
  }).then((res) => {
    if (epoch !== initEpoch || !res.ok) return;
    const byAsin = new Map(res.products.map((p) => [p.asin.toUpperCase(), p]));
    for (const row of rows) {
      const product = byAsin.get(row.tile.asin.toUpperCase());
      if (product) {
        row.market = product;
        recompute(row, settings);
        renderBadge(row, settings);
      }
    }
  });

  // Real Creator Connections rates for the campaign-flagged tiles, so the
  // campaign chip shows the actual percent and the commission estimate uses
  // it. Bloom membership keeps the batch tiny.
  const campaignAsins = caps.ccRates
    ? rows.filter((r) => r.flags.cc || r.flags.spcc).map((r) => r.tile.asin)
    : [];
  if (campaignAsins.length > 0) {
    void sendToBackground<CcRatesResult>({ kind: "LOOKUP_CC_RATES", asins: campaignAsins }).then(
      (res) => {
        if (epoch !== initEpoch || !res.ok) return;
        for (const row of rows) {
          const rate = res.rates[row.tile.asin];
          if (rate) {
            row.ccRate = rate;
            recompute(row, settings);
            renderBadge(row, settings);
          }
        }
      },
    );
  }

  // Anchor before the first tile so applySort packs the sorted block at the
  // top of the results, where the user is looking. Anchoring after the last
  // tile looked like a no-op: dedup-skipped sponsored duplicates and mid-grid
  // ad widgets stayed pinned above the fold while the real tiles reshuffled
  // below it. Reordering still stays within the results block, above
  // pagination and the footer.
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return;
  const parent = first.tile.el.parentElement;
  const anchor = document.createComment("ib-search-anchor");
  first.tile.el.before(anchor);

  const rowAsins = new Set(rows.map((r) => r.tile.asin));

  // Amazon renders sponsored duplicates of tiles we already scored (and
  // hydrates more in after load, above the sorted block). The parser skips
  // them, so left visible they show the stale pre-sort order at the top of
  // the page; hide them instead. Rows themselves are never touched here.
  const hideStrayDupes = (): void => {
    // Amazon-only: Walmart's parser already dedupes and the grid injects no
    // late sponsored duplicates of scored tiles.
    if (!parent || !caps.hideStrayDupes) return;
    for (const tileEl of queryAll<HTMLElement>(parent, "searchResultTile")) {
      if (tileEl.getAttribute(DONE_ATTR)) continue;
      const asin = (tileEl.getAttribute("data-asin") ?? "").trim().toUpperCase();
      if (rowAsins.has(asin)) tileEl.style.display = "none";
    }
  };

  // Walmart's grid nests each tile in its own wrapper across several sub-grids,
  // so tiles cannot be packed above a single anchor without reparenting them.
  // Sort within each grid instead (rows grouped by their cell's parent),
  // re-appending each group's cells in sorted order. No anchor, no reparenting.
  const applyGroupedSort = (key: SortKey): void => {
    const groups = new Map<HTMLElement, Row[]>();
    for (const row of rows) {
      const grid = row.tile.el.parentElement;
      if (!grid) continue;
      const list = groups.get(grid) ?? [];
      list.push(row);
      groups.set(grid, list);
    }
    for (const [grid, group] of groups) {
      group.sort(comparator(key));
      for (const row of group) grid.appendChild(row.tile.el);
    }
  };

  const applySort = (key: SortKey): void => {
    if (caps.sortStrategy === "grouped") {
      applyGroupedSort(key);
      return;
    }
    if (!parent) return;
    hideStrayDupes();
    // Tiles Amazon inserted above the block since init would keep the sorted
    // rows pinned below them; repin the anchor above the current top tile.
    const top = queryAll<HTMLElement>(parent, "searchResultTile").find(
      (tileEl) => tileEl.style.display !== "none",
    );
    if (top && top !== anchor.nextSibling) top.before(anchor);
    const sorted = [...rows].sort(comparator(key));
    for (const row of sorted) parent.insertBefore(row.tile.el, anchor);
  };

  // Sponsored duplicates hydrate in after init (observed live: the whole first
  // row can be late-injected dupes); hide them as they land so the sorted
  // block stays on top.
  if (parent && caps.hideStrayDupes) {
    const dupeWatch = new MutationObserver(() => hideStrayDupes());
    dupeWatch.observe(parent, { childList: true });
    run.signal.addEventListener("abort", () => dupeWatch.disconnect(), { once: true });
  }

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
      if (stopScan || epoch !== initEpoch) break;
      setStatus(t().searchScanning(done + 1, targets.length));
      row.scanned = true;
      try {
        const result = await sendToBackground<ScanAsinResult>({
          kind: "SCAN_ASIN_IN_TAB",
          asin: row.tile.asin,
          marketplace,
        });
        if (epoch !== initEpoch) break;
        if (result.classified && result.counts) {
          row.influencerVideos = result.counts.influencer;
          row.totalVideos = result.counts.total;
          recompute(row, settings);
          renderBadge(row, settings);
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

  const toolbar = renderToolbar({
    count: rows.length,
    onSort: applySort,
    onFilter: applyFilter,
    onScanStart: runScan,
    onScanStop: () => {
      stopScan = true;
    },
    showScan: caps.videoScan,
    showCampaignFilter: caps.campaignFilter,
  });

  mountToolbar(module.toolbarSlot(first.tile.el), toolbar.host);
  // Lead with the best opportunities.
  applySort("score");

  // Automatic tier-1 enrichment: shared 24h cache first, then viewport-first
  // static /dp/ fetches through the serialized chain. Each arrival upgrades
  // the tile's rate (real category), score, video count, and verdict. Rows are
  // never auto re-sorted under the cursor; re-picking a sort in the toolbar
  // applies the updated scores. Amazon-only: Walmart has no /dp/ static page
  // to enrich from (its money data comes from the pooled catalogue + rate card).
  if (!caps.dpEnrich) return;
  void enrichSearchTiles({
    items: rows.map((r) => ({ asin: r.tile.asin, el: r.tile.el })),
    origin: location.origin,
    marketplace,
    signal: run.signal,
    onSignals: (asin, signals) => {
      if (epoch !== initEpoch) return;
      const row = rows.find((r) => r.tile.asin === asin);
      if (!row) return;
      row.dp = signals;
      const category = signals.category ?? signals.bestsellerRank?.category ?? null;
      row.ratePct = resolveRatePct({
        liveRatePct: null,
        category,
        card,
        defaultRatePct: settings.commissionRatePct,
      });
      if (row.totalVideos === null) row.totalVideos = signals.totalVideos;
      // A page with no video carousel at all cannot have influencer videos.
      if (
        row.influencerVideos === null &&
        !signals.upperCarousel &&
        !signals.lowerCarousel &&
        !signals.totalVideos
      ) {
        row.influencerVideos = 0;
        row.scanned = true;
      }
      recompute(row, settings);
      renderBadge(row, settings);
    },
    onStatus: (done, total, paused) => {
      if (epoch !== initEpoch) return;
      if (paused) {
        toolbar.setEnrichStatus(t().searchEnrichPaused);
      } else if (done < total) {
        toolbar.setEnrichStatus(t().searchEnriching(done, total));
      } else {
        toolbar.setEnrichStatus("");
      }
    },
  });
}

// The effective rate for money math: a known CC campaign rate beats the
// rate-card/base rate (it is what a campaign sale actually pays).
function rateFor(row: Row): number {
  return row.ccRate ? row.ccRate.ratePct : row.ratePct;
}

// Estimated monthly revenue in cents: modeled units x price. Prefer the live
// search-tile price (what the shopper sees now) over the pooled snapshot price.
// Null when there is no estimate or no price to multiply by.
function revenueCentsFor(row: Row): number | null {
  const units = row.market?.estMonthlySales;
  if (units == null) return null;
  const priceCents = row.tile.priceCents ?? row.market?.priceCents ?? null;
  if (priceCents == null) return null;
  return Math.round(units * priceCents);
}

// Recompute everything derived from the row's signals: commission estimate,
// Butler Score, and the tile verdict. Callers repaint afterwards.
function recompute(row: Row, settings: Settings): void {
  const rate = rateFor(row);
  row.commissionCents =
    row.tile.priceCents !== null ? Math.round((row.tile.priceCents * rate) / 100) : null;
  const inStock = row.dp ? row.dp.inStock : row.cachedInStock;
  const bought =
    row.tile.boughtPastMonth ?? row.dp?.boughtPastMonth ?? row.market?.boughtPastMonth ?? null;
  row.score = computeButlerScore(
    {
      priceCents: row.tile.priceCents,
      commissionRatePct: rate,
      influencerVideos: row.influencerVideos,
      boughtPastMonth: bought,
      reviewCount: row.tile.reviewCount,
      inStock,
      membership: { cc: row.flags.cc, spcc: row.flags.spcc },
    },
    settings,
  );
  row.verdict = evaluateTileVerdict(
    {
      priceCents: row.tile.priceCents,
      boughtPastMonth: bought,
      inStock,
      influencerVideos: row.influencerVideos,
      totalVideos: row.totalVideos,
      anyCarousel: row.dp ? row.dp.upperCarousel || row.dp.lowerCarousel : null,
    },
    settings.approved,
  );
}

function neutralScore(settings: Settings): ButlerScore {
  return computeButlerScore(
    {
      priceCents: null,
      commissionRatePct: null,
      influencerVideos: null,
      boughtPastMonth: null,
      reviewCount: null,
      inStock: null,
      membership: { cc: false, spcc: false },
    },
    settings,
  );
}

function neutralVerdict(settings: Settings): TileVerdict {
  return evaluateTileVerdict(
    {
      priceCents: null,
      boughtPastMonth: null,
      inStock: null,
      influencerVideos: null,
      totalVideos: null,
      anyCarousel: null,
    },
    settings.approved,
  );
}

function comparator(key: SortKey): (a: Row, b: Row) => number {
  switch (key) {
    case "score":
      return (a, b) => b.score.score - a.score.score;
    case "commission":
      return (a, b) => (b.commissionCents ?? -1) - (a.commissionCents ?? -1);
    case "revenue":
      return (a, b) => (revenueCentsFor(b) ?? -1) - (revenueCentsFor(a) ?? -1);
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

function renderBadge(row: Row, settings: Settings): void {
  const body = row.badgeBody;
  body.replaceChildren();
  body.append(el("span", `tile-score ${row.score.band}`, String(row.score.score)));
  // Verdict first: the yes/no is what the creator scans for.
  if (row.verdict.state === "approved") {
    const chip = el("span", "tile-chip good", t().tileApproved);
    chip.title = verdictTooltip(row, settings);
    body.append(chip);
  } else if (row.verdict.state === "likely") {
    const chip = el("span", "tile-chip", t().tileLikelyFit);
    chip.title = verdictTooltip(row, settings);
    body.append(chip);
  }
  // A product that already paid you is the strongest buy signal on the page:
  // show the real dollars when the ledger has them.
  if (row.earnings) body.append(earnedChip(row));
  if (row.commissionCents !== null) {
    body.append(
      el("span", "tile-chip", t().tileCommission(formatCents(row.commissionCents, row.tile.currency))),
    );
  }
  // Estimated monthly revenue (modeled sales x price) from the shared catalogue:
  // the "is this product actually big?" signal, matching what shoppers see on a
  // best-seller page but never on search. Honest tooltip: modeled vs calibrated.
  const revenueCents = revenueCentsFor(row);
  if (revenueCents !== null && row.market) {
    const chip = el("span", "tile-chip", t().tileRevenue(formatCompactMoney(revenueCents, row.tile.currency)));
    chip.title = row.market.estimateCalibrated ? t().salesEstCalibrated : t().salesEstModeled;
    body.append(chip);
  }
  // Best-seller rank + its category, straight from the pooled snapshot.
  if (row.market?.bsrRank != null) {
    body.append(
      el("span", "tile-chip", t().tileBsr(row.market.bsrRank.toLocaleString(), row.market.bsrCategory)),
    );
  }
  if (row.flags.cc || row.flags.spcc) {
    body.append(
      el(
        "span",
        "tile-chip good",
        row.ccRate ? t().tileCampaignRate(row.ccRate.ratePct) : t().tileCampaign,
      ),
    );
  } else if (row.flags.deals) {
    // Only when no campaign chip is up: two green chips in a row read as noise.
    body.append(el("span", "tile-chip good", t().tileDeal));
  }
  if (row.tile.hasCoupon) body.append(el("span", "tile-chip", t().tileCoupon));
  if (row.influencerVideos !== null) {
    body.append(el("span", "tile-chip", t().tileInfluencer(row.influencerVideos)));
  } else if (row.totalVideos !== null) {
    body.append(el("span", "tile-chip", t().tileVideos(row.totalVideos)));
  }
  if (row.showWatch) body.append(watchControl(row, settings));
  // The "..." action menu: Add to list / Copy link / Open page always, plus the
  // desktop-bridge actions when the app is paired (else an upsell). Mounted last
  // so it sits at the end of the chip row.
  mountTileMenuButton(
    body,
    {
      asin: row.tile.asin,
      marketplace: row.marketplace,
      title: row.tile.title,
      imageUrl: row.tile.imageUrl,
      href: row.tile.href,
      retailer: row.retailer,
    },
    row.hud,
  );
}

// Compact per-criterion tooltip for the verdict chip, reusing the product
// panel's criterion labels with a pass/fail/unknown mark each.
function verdictTooltip(row: Row, settings: Settings): string {
  const approved = settings.approved;
  const mark = (state: "pass" | "fail" | "unknown"): string =>
    state === "pass" ? "[ok]" : state === "fail" ? "[x]" : "[?]";
  return [
    `${mark(row.verdict.activelySelling)} ${t().critBought(approved.minBoughtPerMonth)}`,
    `${mark(row.verdict.openSlot)} ${t().critOpenSlot(approved.maxInfluencerVideos + 1)}`,
    `${mark(row.verdict.inStock)} ${t().critInStock}`,
    `${mark(row.verdict.priceFloor)} ${t().critPriceFloor(approved.minPrice)}`,
  ].join("\n");
}

// The "Earned $X" chip: real ledger dollars for this ASIN, click for the full
// by-store/year/month/campaign breakdown. Stops propagation so it never
// activates the tile's own product link.
function earnedChip(row: Row): HTMLElement {
  const btn = el("button", "tile-chip good earn-chip");
  btn.type = "button";
  const totals = row.earnings
    ? tileTotals(
        new Map([[row.tile.asin.toUpperCase(), row.earnings]]),
        [row.tile.asin],
        "market",
        row.marketplace,
      )
    : [];
  const top = totals[0];
  btn.textContent = top
    ? t().tileEarned(formatMoney(top.amount, top.currency))
    : t().tileProvenEarner;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!row.earnings) return;
    renderEarningsDetail({
      title: row.tile.title,
      earnings: [row.earnings],
      marketplace: row.marketplace,
    });
  });
  return btn;
}

// A small watch toggle on the tile: a star that flips membership without
// leaving the search page. Stops propagation so it never activates the tile's
// own product link.
function watchControl(row: Row, settings: Settings): HTMLElement {
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
      renderBadge(row, settings);
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
// `slot` is resolved per retailer by the module (Amazon's .s-main-slot,
// Walmart's item-stack), so the bar lands above the right grid container.
function mountToolbar(slot: Element | null, host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  if (slot && slot.parentElement) {
    slot.parentElement.insertBefore(host, slot);
  } else if (slot) {
    slot.prepend(host);
  }
}
