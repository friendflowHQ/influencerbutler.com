import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import {
  readManageRows,
  readStorefrontHandle,
  type ManageRow,
} from "../../amazon/creator-hub";
import { harvestStorefront } from "../storefront-check/harvest";
import { downloadCsv } from "../storefront-check/csv";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import { formatMoney } from "../earnings-overlay/model";
import { renderEarningsDetail } from "../earnings-overlay/detail";
import { formatCompactMoney } from "../calculator/model";
import {
  buildContentAsinIndex,
  buildVideoMoney,
  vdpContentId,
  bestEpv,
  coolingPicks,
  drafts,
  primaryEarnedAmount,
  reshootPicks,
  topEarners,
  type VideoInput,
  type VideoMoney,
} from "./model";
import {
  sendToBackground,
  type CcRate,
  type CcRatesResult,
  type EarningsLookupResult,
  type MarketBatchResult,
  type MarketProduct,
} from "../../shared/messages";
import type { AsinEarnings } from "../../transport/hud-commands";
import type { Settings } from "../../storage/schema";
import { log } from "../../shared/log";

// Video Money on the Creator Hub "Manage videos" list (/creatorhub/manage).
// Amazon shows views per video but hides money per video: this badges each row
// with its real earnings (desktop ledger), EPV (earnings per 1,000 views), the
// live Creator Connections rate, and demand, and adds a reshoot summary panel.
// It resolves each row's products by joining the row's contentId against one
// storefront-feed harvest, then reuses the shared market / CC / earnings
// lookups. Self-gating: unpaired users get projections instead of real
// earnings, and rows that resolve to no product simply carry fewer chips.

const DONE_ATTR = "data-ib-vmoney";
const BADGE_HOST = "vmoney-badge-host";
const PANEL_HOST = "vmoney-panel-host";
// The React table hydrates after first paint; poll briefly for the rows.
const ROW_WAIT_MS = 600;
const ROW_WAIT_TRIES = 12;
// The market endpoint caps a batch at 50 ASINs; chunk to match.
const MARKET_CHUNK = 50;
// "Ending soon" window for the live-rate chip.
const ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
// How many rows each leaderboard shows.
const TOP_N = 3;
const RESHOOT_N = 5;

let controller: AbortController | null = null;
let rowObserver: MutationObserver | null = null;

type RowState = { input: VideoInput; body: HTMLElement };

export async function initVideoMoney(settings: Settings): Promise<void> {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  rowObserver?.disconnect();
  rowObserver = null;
  teardown();

  // Give the SPA table a chance to hydrate, but never give up if it is slow: the
  // row observer installed below decorates rows whenever they render (initial
  // load, a late XHR, or pagination), so a slow first paint no longer means no
  // badges. Only an abort (a newer run superseded us) stops us here.
  const initialRows = await waitForRows(run.signal);
  log("video-money", `initVideoMoney initialRows=${initialRows.length} aborted=${run.signal.aborted}`);
  if (run.signal.aborted) return;

  const marketplace = marketplaceFromUrl(location.href);

  // Each row's tagged ASINs come from one storefront harvest, joined by
  // contentId. That harvest pages Amazon's feed and is slow, so it must NOT
  // block the badges: start with empty indexes, render immediately, and let the
  // background pass (below) fill them in and re-enrich the rows.
  const index = new Map<string, string[]>();
  const titleIndex = new Map<string, string>();

  // Accumulating state: badges + data grow as the user pages through the list
  // and as the batched lookups return.
  const states = new Map<string, RowState>();
  const earnings = new Map<string, AsinEarnings>();
  const market = new Map<string, MarketProduct>();
  const ccRates = new Map<string, CcRate>();
  const fetched = new Set<string>();
  const flags = { paired: false };

  const cache = await getCache();
  if (run.signal.aborted) return;
  const loaded = loadFilters(cache);

  const recompute = (): void => {
    const list = [...states.values()].map((s) =>
      buildVideoMoney(s.input, {
        earnings,
        market,
        ccRates,
        marketplace,
        defaultRatePct: settings.commissionRatePct,
        conversionPct: settings.conversionPct,
      }),
    );
    const byId = new Map(list.map((v) => [v.contentId, v]));
    for (const [contentId, state] of states) {
      const vm = byId.get(contentId);
      if (vm) renderRowBadge(state.body, vm, marketplace, earnings);
    }
    renderPanel(list, flags.paired);
  };

  // Fan out the batched lookups for a freshly-seen set of ASINs (dedup so
  // paging never refetches). Each resolver recomputes as it lands.
  const fetchFor = (asins: string[]): void => {
    const fresh = asins.filter((a) => a && !fetched.has(a));
    for (const a of fresh) fetched.add(a);
    if (fresh.length === 0) return;

    for (const group of chunk(fresh, MARKET_CHUNK)) {
      void sendToBackground<MarketBatchResult>({
        kind: "GET_MARKET_BATCH",
        asins: group,
        marketplace,
      }).then((res) => {
        if (run.signal.aborted || !res.ok) return;
        for (const p of res.products) market.set(p.asin.toUpperCase(), p);
        recompute();
      });
    }

    const campaignAsins = fresh.filter((a) => {
      const m = membership(loaded, a);
      return m.cc || m.spcc;
    });
    for (const group of chunk(campaignAsins, MARKET_CHUNK)) {
      void sendToBackground<CcRatesResult>({ kind: "LOOKUP_CC_RATES", asins: group }).then((res) => {
        if (run.signal.aborted || !res.ok) return;
        for (const [asin, rate] of Object.entries(res.rates)) {
          ccRates.set(asin.toUpperCase(), rate);
        }
        recompute();
      });
    }

    void sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins: fresh }).then(
      (res) => {
        // paired:false means the app was never connected; stay in projection mode.
        if (run.signal.aborted || !res.ok || res.paired === false) return;
        for (const e of res.results ?? []) earnings.set(e.asin.toUpperCase(), e);
        flags.paired = true;
        recompute();
      },
    );
  };

  // Decorate the currently-visible rows, mount their badges, and queue their
  // ASINs for lookup. Returns the ASINs newly seen this pass.
  const decorate = (): void => {
    const visible = readManageRows(document).filter((r) => !r.el.getAttribute(DONE_ATTR));
    if (visible.length === 0) return;
    const newAsins: string[] = [];
    for (const row of visible) {
      row.el.setAttribute(DONE_ATTR, "1");
      const asins = index.get(row.contentId) ?? [];
      const input: VideoInput = {
        contentId: row.contentId,
        title: row.title ?? titleIndex.get(row.contentId) ?? null,
        status: row.status,
        views: row.views,
        asins,
      };
      const body = el("div", "tile-badge-body");
      mountBadge(row, body);
      states.set(row.contentId, { input, body });
      newAsins.push(...asins);
    }
    fetchFor([...new Set(newAsins)]);
    recompute();
  };

  // Install the observer first so rows that render after this point are caught,
  // then decorate whatever is already present. Neither waits on the harvest, so
  // the panel and per-row badge shells appear at once.
  watchRows(run.signal, decorate);
  decorate();

  // Background: resolve the storefront handle and harvest the contentId -> ASIN
  // index, then attach ASINs to the already-mounted rows and fire the money
  // lookups. A slow or empty harvest no longer hides the overlay.
  void enrichFromStorefront(run.signal, settings, index, titleIndex, states, fetchFor, recompute);
}

// Fills the contentId -> ASIN/title indexes from one storefront harvest, then
// re-derives each mounted row's ASINs and fans out its money lookups. Runs off
// the render path so the badges never wait on the feed paging.
async function enrichFromStorefront(
  signal: AbortSignal,
  settings: Settings,
  index: Map<string, string[]>,
  titleIndex: Map<string, string>,
  states: Map<string, RowState>,
  fetchFor: (asins: string[]) => void,
  recompute: () => void,
): Promise<void> {
  const handle = readStorefrontHandle(document) ?? settings.storefrontHandle;
  log("video-money", `enrichFromStorefront handle=${handle ?? "none"}`);
  if (!handle) return;
  const resolved = await harvestIndex(handle);
  if (signal.aborted) return;
  for (const [id, asins] of resolved.asins) index.set(id, asins);
  for (const [id, title] of resolved.titles) titleIndex.set(id, title);

  const seen: string[] = [];
  for (const [contentId, state] of states) {
    const asins = index.get(contentId) ?? [];
    state.input.asins = asins;
    if (!state.input.title) state.input.title = titleIndex.get(contentId) ?? null;
    seen.push(...asins);
  }
  log("video-money", `enrichFromStorefront harvested=${resolved.asins.size} asins=${seen.length}`);
  fetchFor([...new Set(seen)]);
  recompute();
}

async function waitForRows(signal: AbortSignal): Promise<ManageRow[]> {
  for (let i = 0; i < ROW_WAIT_TRIES; i += 1) {
    if (signal.aborted) return [];
    const rows = readManageRows(document);
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, ROW_WAIT_MS));
  }
  return [];
}

async function harvestIndex(
  handle: string,
): Promise<{ asins: Map<string, string[]>; titles: Map<string, string> }> {
  try {
    const res = await harvestStorefront(() => undefined, handle);
    const videos = res.items.filter((i) => i.type === "video");
    const titles = new Map<string, string>();
    for (const item of videos) {
      const id = vdpContentId(item.url);
      if (id && item.title) titles.set(id, item.title);
    }
    return { asins: buildContentAsinIndex(videos), titles };
  } catch {
    return { asins: new Map(), titles: new Map() };
  }
}

// The manage table re-renders on pagination without a URL change (so the SPA
// watcher in content/index.ts does not re-run us). Re-decorate newly-rendered
// rows as they appear; the harvest index already covers every page.
function watchRows(signal: AbortSignal, decorate: () => void): void {
  const target = document.querySelector<HTMLElement>("main") ?? document.body;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (signal.aborted) return;
      decorate();
    }, 400);
  });
  observer.observe(target, { childList: true, subtree: true });
  rowObserver = observer;
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}

function mountBadge(row: ManageRow, body: HTMLElement): void {
  const { host, root } = createInlineShadow(BADGE_HOST);
  const wrap = el("div", "tile-badge");
  wrap.append(body);
  root.append(wrap);
  // Place the chips on their own line directly beneath the video's row so they
  // read next to the video they describe. Fall back to appending inside the row.
  host.style.display = "block";
  if (!row.el.insertAdjacentElement("afterend", host)) row.el.append(host);
}

function renderRowBadge(
  body: HTMLElement,
  vm: VideoMoney,
  marketplace: string | null,
  earnings: Map<string, AsinEarnings>,
): void {
  if (!body.isConnected) return;
  body.replaceChildren();

  if (vm.earned.length > 0) {
    const btn = el("button", "tile-chip good earn-badge-btn") as HTMLButtonElement;
    btn.type = "button";
    btn.textContent = vm.earned.map((c) => formatMoney(c.amount, c.currency)).join(" · ");
    btn.title = t().vmEarnedTitle;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const list = vm.asins
        .map((a) => earnings.get(a.toUpperCase()))
        .filter((e): e is AsinEarnings => Boolean(e));
      renderEarningsDetail({ title: vm.title, earnings: list, marketplace });
    });
    body.append(btn);
    if (vm.epv !== null) {
      body.append(el("span", "tile-chip", t().vmEpv(formatMoney(vm.epv, vm.currency))));
    }
  } else if (vm.projectedCents !== null) {
    body.append(el("span", "tile-chip", t().vmProjected(formatCompactMoney(vm.projectedCents, vm.currency))));
  }

  if (vm.liveRatePct !== null) {
    const ending = vm.rateEndsAt !== null && isEndingSoon(vm.rateEndsAt);
    body.append(
      el(
        "span",
        `tile-chip ${ending ? "bad" : "good"}`,
        ending ? t().vmRateEnding(vm.liveRatePct) : t().vmRateLive(vm.liveRatePct),
      ),
    );
  }

  if (vm.boughtPastMonth !== null) {
    const arrow = vm.demand === "up" ? " ▲" : vm.demand === "down" ? " ▼" : "";
    const cls = vm.demand === "up" ? "good" : vm.demand === "down" ? "bad" : "";
    body.append(el("span", `tile-chip ${cls}`.trim(), t().vmBought(vm.boughtPastMonth) + arrow));
  } else if (vm.demand === "down") {
    body.append(el("span", "tile-chip bad", t().vmCoolingChip));
  }
}

function isEndingSoon(endsAt: string): boolean {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return false;
  return end - Date.now() < ENDING_SOON_MS;
}

// ---- Summary / reshoot panel -------------------------------------------------

function renderPanel(list: VideoMoney[], paired: boolean): void {
  const existing = document.querySelector<HTMLElement>(`.${PANEL_HOST}`);
  if (existing) existing.remove();
  if (list.length === 0) return;

  const { host, root } = createInlineShadow(PANEL_HOST);
  const panel = el("div", "vmoney-panel");

  const head = el("div", "vmoney-head");
  head.append(el("span", "vmoney-title", t().vmPanelTitle));
  head.append(el("span", "vmoney-count", t().vmVideoCount(list.length)));
  const exportBtn = el("button", "btn secondary vmoney-export") as HTMLButtonElement;
  exportBtn.type = "button";
  exportBtn.textContent = t().vmExport;
  exportBtn.addEventListener("click", () => exportCsv(list));
  head.append(exportBtn);
  panel.append(head);

  const anyEarnings = list.some((v) => primaryEarnedAmount(v) > 0);
  if (!paired && !anyEarnings) {
    panel.append(el("p", "vmoney-note", t().vmProjectionNote));
  }

  const earners = topEarners(list, TOP_N);
  if (earners.length > 0) {
    panel.append(
      groupBlock(
        t().vmTopEarners,
        earners.map((v) => [v.title, v.earned.map((c) => formatMoney(c.amount, c.currency)).join(" · ")]),
      ),
    );
  }

  const epv = bestEpv(list, TOP_N);
  if (epv.length > 0) {
    panel.append(
      groupBlock(
        t().vmBestEpv,
        epv.map((v) => [v.title, t().vmEpv(formatMoney(v.epv ?? 0, v.currency))]),
      ),
    );
  }

  const reshoot = reshootPicks(list, 10).slice(0, RESHOOT_N);
  if (reshoot.length > 0) {
    panel.append(
      groupBlock(
        t().vmReshoot,
        reshoot.map((v) => [v.title, t().vmRateLive(v.liveRatePct ?? 0)]),
        t().vmReshootHint,
      ),
    );
  }

  const draftRows = drafts(list);
  if (draftRows.length > 0) {
    panel.append(groupBlock(t().vmDrafts, draftRows.map((v) => [v.title, ""]), t().vmDraftsHint));
  }

  const cooling = coolingPicks(list, Date.now());
  if (cooling.length > 0) {
    panel.append(
      groupBlock(
        t().vmCooling,
        cooling.slice(0, TOP_N).map((v) => [v.title, ""]),
        t().vmCoolingHint,
      ),
    );
  }

  root.append(panel);
  mountPanelHost(host);
}

function groupBlock(heading: string, rows: Array<[string | null, string]>, hint?: string): HTMLElement {
  const block = el("div", "vmoney-group");
  block.append(el("h5", "vmoney-group-title", heading));
  if (hint) block.append(el("span", "vmoney-group-hint", hint));
  const listEl = el("div", "vmoney-rows");
  for (const [title, value] of rows) {
    const rowEl = el("div", "vmoney-row");
    rowEl.append(el("span", "vmoney-row-title", title ?? "Untitled"));
    if (value) rowEl.append(el("span", "vmoney-row-value", value));
    listEl.append(rowEl);
  }
  block.append(listEl);
  return block;
}

function mountPanelHost(host: HTMLElement): void {
  host.style.display = "block";
  const firstRow = document.querySelector<HTMLElement>(`[${DONE_ATTR}]`);
  const table = firstRow?.closest<HTMLElement>("table, [role='table'], ul, section");
  if (table && table.parentElement) {
    table.parentElement.insertBefore(host, table);
  } else {
    (document.querySelector("main") ?? document.body).prepend(host);
  }
}

function exportCsv(list: VideoMoney[]): void {
  const header = [
    "content_id",
    "title",
    "status",
    "views",
    "tagged_asins",
    "earned",
    "currency",
    "epv_per_1k",
    "live_rate_pct",
    "rate_ends_at",
    "bought_past_month",
    "demand",
    "projected",
  ];
  const rows = [header.join(",")];
  for (const v of list) {
    const earned = v.earned.map((c) => `${c.amount.toFixed(2)} ${c.currency}`).join(" | ");
    rows.push(
      [
        v.contentId,
        esc(v.title ?? ""),
        v.status,
        v.views ?? "",
        v.asins.join(" "),
        esc(earned),
        v.currency,
        v.epv !== null ? v.epv.toFixed(2) : "",
        v.liveRatePct ?? "",
        v.rateEndsAt ?? "",
        v.boughtPastMonth ?? "",
        v.demand ?? "",
        v.projectedCents !== null ? (v.projectedCents / 100).toFixed(2) : "",
      ].join(","),
    );
  }
  downloadCsv(`video-money-${Date.now()}.csv`, rows.join("\n"));
}

function esc(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function teardown(): void {
  for (const host of Array.from(document.querySelectorAll(`.${BADGE_HOST}, .${PANEL_HOST}`))) {
    host.remove();
  }
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }
}
