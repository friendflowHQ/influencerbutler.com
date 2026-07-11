import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { log } from "../../shared/log";
import { patchSettings } from "../../storage/store";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import {
  sendToBackground,
  type EarningsLookupResult,
  type OrderAsinsResult,
} from "../../shared/messages";
import { readCampaignGrid, daysUntil, type Campaign } from "../../amazon/creator-campaigns";
import {
  computeCampaignScore,
  meetsRadarThresholds,
  type CampaignScore,
  type CampaignScoreInputs,
  type RadarThresholds,
} from "./score";
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
  score: CampaignScore;
  badgeBody: HTMLElement;
};

export async function initCampaignRadar(settings: Settings): Promise<void> {
  // Tear down a prior run (Amazon rewrites the grid as the creator filters), then
  // rebuild cleanly over the current cards.
  for (const host of Array.from(
    document.querySelectorAll(".radar-badge-host, .radar-toolbar-host"),
  )) {
    host.remove();
  }
  for (const node of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    node.removeAttribute(DONE_ATTR);
    setHighlight(node as HTMLElement, false);
  }

  const campaigns = readCampaignGrid(document).filter((c) => {
    if (c.el.getAttribute(DONE_ATTR)) return false;
    c.el.setAttribute(DONE_ATTR, "1");
    return true;
  });
  if (campaigns.length === 0) return;

  const now = new Date();
  const thresholds: RadarThresholds = { ...settings.campaignRadar };
  const loaded = loadFilters(await getCache());

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
      score: computeCampaignScore(inputsFor(campaign, daysRemaining, null, null)),
      badgeBody,
    };
    mountBadge(campaign.el, badgeBody);
    renderBadge(row);
    applyHighlight(row, thresholds);
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
  mountToolbar(first.campaign.el, toolbar);
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
  body.append(el("span", `tile-score ${row.score.band}`, String(row.score.score)));

  // Personal signals lead: a product you own or have earned on is the strongest
  // reason to take a campaign.
  if (row.owned) body.append(el("span", "tile-chip good", t().radarChipOwned));
  if (row.provenEarner) body.append(el("span", "tile-chip good", t().radarChipEarner));

  if (row.campaign.commissionRatePct !== null) {
    body.append(el("span", "tile-chip", t().radarChipRate(row.campaign.commissionRatePct)));
  }
  if (row.daysRemaining !== null) {
    body.append(
      el(
        "span",
        "tile-chip",
        row.daysRemaining >= 0
          ? t().radarChipDays(row.daysRemaining)
          : t().radarChipEnded,
      ),
    );
  }
  if (row.campaign.remainingBudgetCents !== null) {
    body.append(el("span", "tile-chip", t().radarChipBudget(fmtBudget(row.campaign.remainingBudgetCents))));
  }
  if (row.cc) body.append(el("span", "tile-chip good", t().radarChipCc));
  if (row.spcc) body.append(el("span", "tile-chip good", t().radarChipSpcc));
}

// Toggle the card highlight based on whether it clears the user's thresholds.
function applyHighlight(row: Row, thresholds: RadarThresholds): void {
  const inputs = inputsFor(row.campaign, row.daysRemaining, row.owned, row.provenEarner);
  setHighlight(row.campaign.el, meetsRadarThresholds(inputs, thresholds));
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

// A plain "$1,234" from cents (Creator Connections budgets are shown in whole
// dollars). Currency symbol assumed USD: the grid does not expose a currency code
// and this is a display hint, not a computed money value.
function fmtBudget(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
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
  const bar = el("div", "search-toolbar");

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

// Place the toolbar just above the grid so it spans the campaign cards.
function mountToolbar(cardEl: HTMLElement, host: HTMLElement): void {
  host.style.display = "block";
  host.style.width = "100%";
  const parent = cardEl.parentElement;
  if (parent && parent.parentElement) {
    parent.parentElement.insertBefore(host, parent);
  } else if (parent) {
    parent.prepend(host);
  }
}
