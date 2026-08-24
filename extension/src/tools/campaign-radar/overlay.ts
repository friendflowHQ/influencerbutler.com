import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t, getLocale } from "../../i18n";
import { log } from "../../shared/log";
import { patchSettings } from "../../storage/store";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import {
  sendToBackground,
  type CampaignBriefResult,
  type CampaignBriefSignals,
  type CampaignWatchListResult,
  type EarningsLookupResult,
  type OrderAsinsResult,
} from "../../shared/messages";
import {
  readCampaignGrid,
  daysUntil,
  applyCampaignFills,
  type Campaign,
  type CampaignFill,
} from "../../amazon/creator-campaigns";
import type { Availability } from "../../background/market-availability";
import { getCachedAvailability, putCachedAvailability } from "./availability-cache";
import {
  campaignFillPct,
  computeCampaignScore,
  computeCampaignConfidence,
  meetsRadarThresholds,
  type CampaignScore,
  type CampaignScoreInputs,
  type RadarThresholds,
} from "./score";
import { openCampaignBrief } from "./campaign-brief-panel";
import type { Settings } from "../../storage/schema";

// Campaign Radar overlay: score and highlight the campaigns on the Creator
// Connections grid, with the user's own thresholds live in a toolbar. This is our
// answer to the competitor's fixed "pink border" highlight: same idea, but the
// creator sets the parameters, and we layer in signals the competition cannot see
// (a product they already own, or have already earned on).
//
// Each card gets a per-card shadow-DOM badge (score + chips) and, when it clears
// the thresholds, an inline outline (our "pink border"). A full-width toolbar
// above the grid holds the live thresholds and a "passing only" filter. A
// done-marker guards against SPA double-decoration. We do NOT reorder cards: the
// grid is a React SPA with each card in its own wrapper, so moving nodes would
// fight React (see initCampaignRadar).

// Marks a card as decorated so an SPA re-render does not double-badge it.
const DONE_ATTR = "data-ib-radar";
// The highlight is applied as inline styles on the card (a light-DOM element the
// shadow stylesheet cannot reach). Brand orange, not the competitor's pink.
const HIGHLIGHT_OUTLINE = "2px solid #fb923c";

type Row = {
  campaign: Campaign;
  daysRemaining: number | null;
  // null = unknown (order history not synced / app not paired); true/false once a
  // lookup resolves. Kept nullable so an un-enriched card scores neutrally.
  owned: boolean | null;
  provenEarner: boolean | null;
  cc: boolean;
  spcc: boolean;
  // Per-market buy-box availability of the card's first product (US/CA/UK/AU),
  // resolved lazily viewport-first. null until a lookup lands; no chip is shown
  // for a card without grid-level ASINs (common on CC Affiliate+ cards).
  availability: Record<string, Availability> | null;
  score: CampaignScore;
  badgeBody: HTMLElement;
  // Whether the Butler is watching this campaign for Last Call (the bell state).
  // Seeded from the background watchlist, flipped optimistically on toggle.
  watched: boolean;
};

// The viewport observer driving lazy availability lookups. Module-level so a
// re-init (Amazon rewrites the grid constantly) can disconnect the previous
// run's observer instead of leaking it against removed nodes.
let availabilityObserver: IntersectionObserver | null = null;

// Whether Last Call Butler is on for this run, so renderBadge (called from many
// enrichment callbacks) can decide whether to draw the watch bell without
// threading settings through every call site. Set at the top of each init.
let lastCallEnabled = false;

// Whether Campaign Butler ("The Butler's Brief") is on for this run, so the
// badge can decide whether to draw the "Brief" button. Set at the top of init.
let campaignButlerEnabled = false;

// Init epoch: initCampaignRadar awaits between its teardown and its mounting,
// so two SPA-triggered runs can interleave and BOTH mount (seen live as two
// badges per card). Each run takes a ticket; after any await it bails if a
// newer run has started, leaving exactly one run to decorate the grid.
let initEpoch = 0;

export async function initCampaignRadar(
  settings: Settings,
  fills: Record<string, CampaignFill> = {},
): Promise<void> {
  // Tear down a prior run (Amazon rewrites the grid as the creator filters), then
  // rebuild cleanly over the current cards.
  availabilityObserver?.disconnect();
  availabilityObserver = null;
  for (const host of Array.from(
    document.querySelectorAll(".radar-badge-host, .radar-toolbar-host"),
  )) {
    host.remove();
  }
  for (const node of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    node.removeAttribute(DONE_ATTR);
    setHighlight(node as HTMLElement, false);
    setDimmed(node as HTMLElement, false);
  }

  const campaigns = readCampaignGrid(document).filter((c) => {
    if (c.el.getAttribute(DONE_ATTR)) return false;
    c.el.setAttribute(DONE_ATTR, "1");
    return true;
  });
  if (campaigns.length === 0) return;

  lastCallEnabled = settings.tools.lastCallButler;
  campaignButlerEnabled = settings.tools.campaignButler;

  // Merge the campaign fill / capacity captured from the API (Last Call). Fill is
  // not in the card DOM, so this is how each card learns how full it is.
  applyCampaignFills(campaigns, fills);

  const epoch = ++initEpoch;
  const now = new Date();
  const thresholds: RadarThresholds = { ...settings.campaignRadar };
  const loaded = loadFilters(await getCache());
  if (epoch !== initEpoch) return;

  // Which campaigns the Butler is already watching, so the bells render correct.
  // A failure here just leaves every bell "off"; the toggle still works.
  const watchedIds = new Set<string>();
  if (settings.tools.lastCallButler) {
    try {
      const res = await sendToBackground<CampaignWatchListResult>({ kind: "CAMPAIGN_WATCH_LIST" });
      for (const id of res.campaignIds) watchedIds.add(id);
    } catch (error) {
      log("campaign-radar", "watch list read failed", error);
    }
  }
  if (epoch !== initEpoch) return;

  const rows: Row[] = campaigns.map((campaign) => {
    const daysRemaining = campaign.endsAt ? daysUntil(campaign.endsAt, now) : null;
    // "CC / SPCC eligible" is informational: any of the campaign's products in our
    // cached catalogue. Empty ASIN lists simply read as not-eligible (no chip).
    const cc = campaign.asins.some((a) => membership(loaded, a).cc);
    const spcc = campaign.asins.some((a) => membership(loaded, a).spcc);
    const badgeBody = el("div", "tile-badge-body");
    const row: Row = {
      campaign,
      daysRemaining,
      owned: null,
      provenEarner: null,
      cc,
      spcc,
      availability: null,
      score: computeCampaignScore(inputsFor(campaign, daysRemaining, null, null)),
      badgeBody,
      watched: settings.tools.lastCallButler && campaign.campaignId !== null
        ? watchedIds.has(campaign.campaignId)
        : false,
    };
    // Badge onto the stats block so the score sits next to the numbers it
    // explains; outline/dim/filter target `el`, the full visual card.
    mountBadge(campaign.detailsEl, badgeBody);
    renderBadge(row);
    applyHighlight(row, thresholds);
    // A fully claimed campaign can no longer be accepted: dim it so the creator's
    // eye skips it, and never highlight it as a pick.
    if (lastCallEnabled && campaign.fullyClaimed === true) setDimmed(campaign.el, true);
    return row;
  });

  // Enrichment 1: products the creator already owns (from synced order history).
  // A no-op (ok:false) when they never signed in, so owned stays unknown.
  void sendToBackground<OrderAsinsResult>({ kind: "GET_ORDER_ASINS" })
    .then((res) => {
      if (!res.ok) return;
      const owned = new Set(res.items.map((i) => i.asin.toUpperCase()));
      for (const row of rows) {
        // Only claim a known true/false when the card exposed products; otherwise
        // leave it unknown so a card-only campaign is not scored as "not owned".
        row.owned = row.campaign.asins.length
          ? row.campaign.asins.some((a) => owned.has(a.toUpperCase()))
          : null;
        rescore(row);
        renderBadge(row);
        applyHighlight(row, thresholds);
      }
    })
    .catch((error) => log("campaign-radar", "owned lookup failed", error));

  // Enrichment 2: products the creator has already earned on (desktop app ledger).
  // Instant no-op when the app was never paired.
  const allAsins = [...new Set(rows.flatMap((r) => r.campaign.asins))];
  if (allAsins.length > 0) {
    void sendToBackground<EarningsLookupResult>({ kind: "LOOKUP_EARNINGS", asins: allAsins })
      .then((res) => {
        if (!res.ok || res.paired === false) return;
        const earners = new Set(
          res.results.filter((r) => r.hasEarnings).map((r) => r.asin.toUpperCase()),
        );
        for (const row of rows) {
          row.provenEarner = row.campaign.asins.length
            ? row.campaign.asins.some((a) => earners.has(a.toUpperCase()))
            : null;
          rescore(row);
          renderBadge(row);
          applyHighlight(row, thresholds);
        }
      })
      .catch((error) => log("campaign-radar", "earnings lookup failed", error));
  }

  // Enrichment 3: per-country buy-box availability of each card's first product,
  // for the markets the creator picked in the popup (empty = off, zero fetches).
  // Cache hits render immediately; misses resolve lazily viewport-first because
  // each probe is a paced cross-marketplace page fetch (300-700ms per market).
  const availabilityMarkets = [
    ...new Set(settings.availabilityMarkets.map((m) => m.toUpperCase())),
  ];
  if (availabilityMarkets.length > 0) {
    void enrichAvailability(rows, availabilityMarkets).catch((error) =>
      log("campaign-radar", "availability lookup failed", error),
    );
  }

  // The toolbar: live thresholds (the differentiator) plus a "passing only"
  // filter. Threshold edits persist and re-highlight instantly.
  //
  // We deliberately do NOT reorder the cards. Verified live 2026-07-10: this grid
  // renders each card in its own wrapper (no shared sibling container), and it is
  // a React SPA, so moving card nodes would tear them out of their wrappers and
  // fight React's reconciliation. The highlight (our "pink border" equivalent) and
  // the filter deliver the value without touching DOM order.
  const first = rows[0];
  if (!first) return;
  let filterPassingOnly = false;

  const applyFilter = (): void => {
    for (const row of rows) {
      const inputs = inputsFor(row.campaign, row.daysRemaining, row.owned, row.provenEarner);
      const hide = filterPassingOnly && !meetsRadarThresholds(inputs, thresholds);
      // Hide the card's own wrapper (its distinct parent) so filtering leaves no
      // empty grid cell; fall back to the card element itself.
      const target = (row.campaign.el.parentElement as HTMLElement | null) ?? row.campaign.el;
      target.style.display = hide ? "none" : "";
    }
  };

  const toolbar = renderToolbar({
    count: rows.length,
    thresholds,
    onThreshold: (next) => {
      Object.assign(thresholds, next);
      void patchSettings({ campaignRadar: { ...thresholds } });
      for (const row of rows) applyHighlight(row, thresholds);
      applyFilter();
    },
    onFilter: (on) => {
      filterPassingOnly = on;
      applyFilter();
    },
  });
  mountToolbar(rows.map((r) => r.campaign.el), toolbar);
}

function inputsFor(
  campaign: Campaign,
  daysRemaining: number | null,
  owned: boolean | null,
  provenEarner: boolean | null,
): CampaignScoreInputs {
  return {
    commissionRatePct: campaign.commissionRatePct,
    daysRemaining,
    remainingBudgetCents: campaign.remainingBudgetCents,
    owned,
    provenEarner,
    fillPct: campaignFillPct(campaign.slotsFilled, campaign.slotsTotal),
    fullyClaimed: campaign.fullyClaimed,
  };
}

function rescore(row: Row): void {
  row.score = computeCampaignScore(
    inputsFor(row.campaign, row.daysRemaining, row.owned, row.provenEarner),
  );
}

function mountBadge(cardEl: HTMLElement, body: HTMLElement): void {
  const { host, root } = createInlineShadow("radar-badge-host");
  const wrap = el("div", "tile-badge");
  wrap.append(body);
  root.append(wrap);
  cardEl.append(host);
}

function renderBadge(row: Row): void {
  const body = row.badgeBody;
  body.replaceChildren();

  const scoreRow = el("div", "tile-score-row");
  scoreRow.style.display = "flex";
  scoreRow.style.alignItems = "center";
  scoreRow.style.gap = "6px";
  scoreRow.append(el("span", `tile-score ${row.score.band}`, String(row.score.score)));
  // Last Call watch bell: have the Butler alert you before this campaign fills.
  // Only when the campaign exposes a stable id to key the watch on.
  if (lastCallEnabled && row.campaign.campaignId) scoreRow.append(renderWatchBell(row));
  // Campaign Butler: open the on-demand "Butler's Brief" for this campaign.
  if (campaignButlerEnabled) scoreRow.append(renderBriefButton(row));
  body.append(scoreRow);

  // Last Call fill meter: how full the campaign is (creator slots claimed vs
  // cap). Fill lives only in the API capture, so a card without it simply shows
  // no meter. A fully claimed campaign reads "Full" and the card is dimmed.
  if (lastCallEnabled && row.campaign.slotsTotal !== null) body.append(renderFillMeter(row));

  // Personal signals lead: a product you own or have earned on is the strongest
  // reason to take a campaign.
  if (row.owned) body.append(el("span", "tile-chip good", t().radarChipOwned));
  if (row.provenEarner) body.append(el("span", "tile-chip good", t().radarChipEarner));

  // Rate, days-left, and budget are NOT repeated as chips: the native card
  // already prints them right above the badge (they still feed the score).
  // "Ended" is the one derived timing fact the card does not state outright.
  if (row.daysRemaining !== null && row.daysRemaining < 0) {
    body.append(el("span", "tile-chip bad", t().radarChipEnded));
  }
  if (row.cc) body.append(el("span", "tile-chip good", t().radarChipCc));
  if (row.spcc) body.append(el("span", "tile-chip good", t().radarChipSpcc));

  // Per-country availability chips (US ✓ / UK ✗ / AU ?), one per market the
  // creator picked. Only rendered once a lookup or cache hit lands, so a card
  // without grid-level products simply never grows these chips.
  if (row.availability) {
    for (const [code, status] of Object.entries(row.availability)) {
      const cls =
        status === "available"
          ? "tile-chip good"
          : status === "unavailable"
            ? "tile-chip bad"
            : "tile-chip";
      const chip = el("span", cls, t().radarAvailChip(code, status));
      chip.title = t().radarAvailTitle(code, status);
      body.append(chip);
    }
  }
}

// ---- Last Call: fill meter + watch bell -------------------------------------

// A slim capacity bar plus a label, built with inline styles so it needs no
// shared stylesheet class. Green until ~75% full, amber approaching full, red
// when fully claimed. The card is dimmed when the campaign has closed.
function renderFillMeter(row: Row): HTMLElement {
  const filled = row.campaign.slotsFilled;
  const total = row.campaign.slotsTotal;
  const full = row.campaign.fullyClaimed === true;
  const pct = campaignFillPct(filled, total);
  const pctInt = pct === null ? null : Math.round(pct * 100);

  const wrap = el("div", "radar-fill");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "5px";
  wrap.style.marginTop = "4px";

  const bar = el("div");
  bar.style.position = "relative";
  bar.style.width = "48px";
  bar.style.height = "6px";
  bar.style.flex = "0 0 auto";
  bar.style.borderRadius = "999px";
  bar.style.background = "rgba(0,0,0,0.18)";
  bar.style.overflow = "hidden";
  const level = el("div");
  level.style.height = "100%";
  level.style.width = `${pctInt ?? 0}%`;
  level.style.borderRadius = "999px";
  level.style.background = full ? "#ef4444" : pct !== null && pct >= 0.75 ? "#f59e0b" : "#22c55e";
  bar.append(level);

  const label = el(
    "span",
    "",
    full
      ? t().lastCallFull
      : pctInt === null
        ? t().lastCallFillUnknown
        : t().lastCallFillLabel(pctInt, filled ?? 0, total ?? 0),
  );
  label.style.fontSize = "11px";
  label.style.fontWeight = "600";
  label.style.whiteSpace = "nowrap";
  label.style.color = full ? "#ef4444" : "inherit";

  wrap.append(bar, label);
  return wrap;
}

function renderWatchBell(row: Row): HTMLElement {
  const btn = el("button", "radar-bell", row.watched ? "🔔" : "🔕");
  btn.type = "button";
  btn.title = row.watched ? t().lastCallWatching : t().lastCallWatch;
  btn.setAttribute("aria-label", btn.title);
  btn.style.border = "none";
  btn.style.background = "transparent";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "13px";
  btn.style.lineHeight = "1";
  btn.style.padding = "0";
  btn.style.opacity = row.watched ? "1" : "0.6";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleWatch(row);
  });
  return btn;
}

// Optimistically flip the bell, then persist through the background. The
// background returns the authoritative watched set, so a cap-block or a failure
// reconciles the UI back to the truth.
async function toggleWatch(row: Row): Promise<void> {
  const campaignId = row.campaign.campaignId;
  if (!campaignId) return;
  const next = !row.watched;
  row.watched = next;
  renderBadge(row);
  try {
    const res = await sendToBackground<CampaignWatchListResult>(
      next
        ? {
            kind: "CAMPAIGN_WATCH_ADD",
            item: { campaignId, brand: row.campaign.brand },
          }
        : { kind: "CAMPAIGN_WATCH_REMOVE", campaignId },
    );
    const authoritative = res.campaignIds.includes(campaignId);
    if (authoritative !== row.watched) {
      row.watched = authoritative;
      renderBadge(row);
    }
  } catch (error) {
    row.watched = !next;
    renderBadge(row);
    log("campaign-radar", "watch toggle failed", error);
  }
}

// ---- Campaign Butler: The Butler's Brief ------------------------------------

// The "Brief" chip on a card badge. Opens the on-demand advisory panel. Kept
// visually quiet (a small outlined pill) so it sits beside the score without
// competing with it.
function renderBriefButton(row: Row): HTMLElement {
  const btn = el("button", "radar-brief-btn", t().campaignBriefButton);
  btn.type = "button";
  btn.title = t().campaignBriefTitle;
  btn.style.border = "1px solid #fb923c";
  btn.style.background = "transparent";
  btn.style.color = "#c2410c";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "11px";
  btn.style.fontWeight = "700";
  btn.style.lineHeight = "1";
  btn.style.padding = "3px 8px";
  btn.style.borderRadius = "999px";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBrief(row);
  });
  return btn;
}

// Assemble the campaign's signals (with the locally-computed score + confidence)
// and open the panel. The demand lookup and the reasoning prose happen in the
// background/server; here we only gather what the card already knows.
function openBrief(row: Row): void {
  const campaign = row.campaign;
  const inputs = inputsFor(campaign, row.daysRemaining, row.owned, row.provenEarner);
  const confidence = computeCampaignConfidence(inputs, {
    hasCcStats: campaign.stats !== null,
    hasDemand: campaign.asins.length > 0,
  });

  const signals: CampaignBriefSignals = {
    brand: campaign.brand,
    commissionRatePct: campaign.commissionRatePct,
    remainingBudgetCents: campaign.remainingBudgetCents,
    daysRemaining: row.daysRemaining,
    slotsFilled: campaign.slotsFilled,
    slotsTotal: campaign.slotsTotal,
    fullyClaimed: campaign.fullyClaimed,
    score: row.score.score,
    band: row.score.band,
    confidence,
    ccStats: campaign.stats,
    asins: campaign.asins,
    // The Creator Connections Affiliate+ grid is the US marketplace; the card
    // ASINs are amazon.com products, so the catalogue read targets that store.
    marketplace: "amazon.com",
    locale: getLocale(),
  };

  // Wire "Accept campaign" to the card's own native accept button when present.
  const acceptBtn = campaign.el.querySelector<HTMLElement>(
    '[data-testid$="-campaign-card-accept-btn"]',
  );

  openCampaignBrief({
    brand: campaign.brand,
    score: row.score,
    confidence,
    locale: getLocale(),
    request: () =>
      sendToBackground<CampaignBriefResult>({ kind: "GET_CAMPAIGN_BRIEF", signals }),
    onAccept: acceptBtn ? () => acceptBtn.click() : null,
    watched: row.watched,
    onToggleWatch:
      campaign.campaignId !== null
        ? async () => {
            await toggleWatch(row);
            return row.watched;
          }
        : null,
  });
}

// ---- Availability enrichment -------------------------------------------------

// Keep only the requested market codes from a lookup result.
function pickMarkets(
  res: Record<string, Availability>,
  markets: string[],
): Record<string, Availability> {
  const out: Record<string, Availability> = {};
  for (const code of markets) {
    const status = res[code];
    if (status) out[code] = status;
  }
  return out;
}

// Resolve per-market availability for each card's FIRST product: cache pass
// upfront (one storage read, instant chips), then a viewport-first sequential
// queue for the misses. One product per card keeps the probe cost bounded on
// large grids; SPCC cards carry exactly one grid-level ASIN anyway, and CC
// cards without ASINs are skipped entirely (no chip, no fetch).
async function enrichAvailability(rows: Row[], markets: string[]): Promise<void> {
  const candidates = rows.filter((r) => r.campaign.asins.length > 0);
  if (candidates.length === 0) return;

  const firstAsin = (row: Row): string => row.campaign.asins[0]!.toUpperCase();
  const cached = await getCachedAvailability(candidates.map(firstAsin), markets);

  const pending: Row[] = [];
  for (const row of candidates) {
    const hit = cached[firstAsin(row)];
    if (hit && Object.keys(hit).length > 0) {
      row.availability = pickMarkets(hit, markets);
      renderBadge(row);
    }
    // Queue when any requested market is still missing a fresh verdict.
    if (!hit || markets.some((m) => hit[m] === undefined)) pending.push(row);
  }
  if (pending.length === 0) return;

  const queue: Row[] = [];
  let draining = false;
  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const row = queue.shift();
        if (!row) break;
        const asin = firstAsin(row);
        const res = await sendToBackground<Record<string, Availability>>({
          kind: "FETCH_MARKET_AVAILABILITY",
          asin,
          markets,
        }).catch(() => ({}) as Record<string, Availability>);
        row.availability = { ...(row.availability ?? {}), ...pickMarkets(res, markets) };
        renderBadge(row);
        void putCachedAvailability(asin, res);
      }
    } finally {
      draining = false;
    }
  };

  availabilityObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      availabilityObserver?.unobserve(entry.target);
      const row = pending.find((r) => r.campaign.el === entry.target);
      if (row && !queue.includes(row)) queue.push(row);
    }
    void drain();
  });
  for (const row of pending) availabilityObserver.observe(row.campaign.el);
}

// Toggle the card highlight based on whether it clears the user's thresholds.
function applyHighlight(row: Row, thresholds: RadarThresholds): void {
  const inputs = inputsFor(row.campaign, row.daysRemaining, row.owned, row.provenEarner);
  setHighlight(row.campaign.el, meetsRadarThresholds(inputs, thresholds));
}

// Dim a fully claimed campaign card (a closed door), applied as an inline style
// on the light-DOM card element like the highlight outline.
function setDimmed(el: HTMLElement, on: boolean): void {
  el.style.opacity = on ? "0.55" : "";
}

function setHighlight(el: HTMLElement, on: boolean): void {
  if (on) {
    el.style.outline = HIGHLIGHT_OUTLINE;
    el.style.outlineOffset = "2px";
    el.style.borderRadius = "10px";
  } else {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.borderRadius = "";
  }
}

// ---- Toolbar ----------------------------------------------------------------

type ToolbarCallbacks = {
  count: number;
  thresholds: RadarThresholds;
  onThreshold: (next: Partial<RadarThresholds>) => void;
  onFilter: (on: boolean) => void;
};

function renderToolbar(cb: ToolbarCallbacks): HTMLElement {
  const { host, root } = createInlineShadow("radar-toolbar-host");
  const bar = el("div", "search-toolbar radar-toolbar");

  const brand = el("div", "search-brand");
  brand.append(el("span", "search-count", t().radarCount(cb.count)));

  bar.append(brand);
  bar.append(
    numberControl(t().radarMinCommission, cb.thresholds.minCommissionPct, 0, 1, (v) =>
      cb.onThreshold({ minCommissionPct: v }),
    ),
  );
  bar.append(
    numberControl(t().radarMinDays, cb.thresholds.minDaysRemaining, 0, 1, (v) =>
      cb.onThreshold({ minDaysRemaining: v }),
    ),
  );
  bar.append(
    numberControl(t().radarMinBudget, cb.thresholds.minRemainingBudget, 0, 100, (v) =>
      cb.onThreshold({ minRemainingBudget: v }),
    ),
  );

  // "Only passing" filter.
  const filterWrap = el("label", "search-control search-check");
  const filter = el("input");
  filter.type = "checkbox";
  filter.addEventListener("change", () => cb.onFilter(filter.checked));
  filterWrap.append(filter, el("span", "", t().radarOnlyPassing));
  bar.append(filterWrap);

  root.append(bar);
  return host;
}

function numberControl(
  label: string,
  value: number,
  min: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const wrap = el("label", "search-control");
  wrap.append(el("span", "search-control-label", label));
  const input = el("input");
  input.type = "number";
  input.min = String(min);
  input.step = String(step);
  input.value = String(value);
  input.className = "search-price";
  input.addEventListener("change", () => {
    const n = parseFloat(input.value);
    if (Number.isFinite(n) && n >= min) onChange(n);
  });
  wrap.append(input);
  return wrap;
}

// Place the toolbar at the top of the grid container so it spans the campaign
// cards. The container is found structurally (the lowest common ancestor of the
// first and last card) rather than by counting wrapper levels, because Amazon's
// wrapper depth is not stable. The host is inserted as a direct child of that
// container, before the subtree holding the first card, and told to span every
// column / wrap to its own flex line: mounting it any deeper makes it occupy
// the first card's cell and shove that card's content into the row below (the
// mangled first card this replaces).
function mountToolbar(cardEls: HTMLElement[], host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  host.style.gridColumn = "1 / -1";
  host.style.flex = "1 1 100%";
  const first = cardEls[0];
  const last = cardEls[cardEls.length - 1];
  if (!first || !last) return;

  // Lowest ancestor of the first card that also contains the last card = the
  // shared grid container (with a single card this is just the card's parent).
  let grid: HTMLElement | null = first.parentElement;
  while (grid && !grid.contains(last)) grid = grid.parentElement;
  if (!grid) return;

  // The grid's direct child whose subtree holds the first card, so the toolbar
  // lands above the first row of cards.
  let anchor: HTMLElement = first;
  while (anchor.parentElement && anchor.parentElement !== grid) anchor = anchor.parentElement;

  // Virtualized grid (verified live 2026-08-16: ReactVirtualized): the cells
  // are absolutely positioned, so a static child inserted in the container
  // would simply underlap the first row. Mount above the scrolling grid
  // element instead so the toolbar gets its own layout space.
  if (getComputedStyle(anchor).position === "absolute") {
    const scroller = grid.parentElement;
    if (scroller && scroller.parentElement) {
      scroller.parentElement.insertBefore(host, scroller);
      return;
    }
  }
  grid.insertBefore(host, anchor);
}
