import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { parseStorefrontTiles, type StorefrontTile } from "../../amazon/storefront-tiles";
import { marketplaceFromUrl } from "../../amazon/product-signals";
import { getCache, loadFilters, membership } from "../../catalogue/cache";
import {
  sendToBackground,
  type CcRatesResult,
  type SpccRatesResult,
  type CcRate,
  type SpccRate,
} from "../../shared/messages";
import { getFlags } from "../../flags/cache";
import { activeDealEvent, retailerOfMarketplace } from "../../deals/events";
import { formatMoney } from "../earnings-overlay/model";
import { campaignEnd, formatEndDay } from "../idea-list/campaign-detail";
import {
  currencyForMarketplace,
  floatOrders,
  floatRank,
  summarizeCard,
  type CardCampaignInput,
  type CardCampaignSummary,
} from "./model";

// Storefront money chips: the Idea List / search chips, on the content cards of
// the creator's own storefront. A video card tags several products, so each card
// shows the best campaign among them (Creator Connections rate + end date, SPCC
// $/click) and "+N" for how many tagged products are in a campaign. Tier 0 only:
// campaign membership is instant from the local catalogue, the real rate and
// SPCC terms come from the daily rate tables (batched, no tabs opened). The card
// carries no price, so there is no per-sale amount or Butler Score here.
//
// Cards with a campaign or a deal also float to the top of the grid (CSS `order`,
// so Amazon's own DOM is never reordered), behind a toggle bar above the grid.
//
// Photo and idea-list cards expose no tagged ASINs in the feed (parseStorefront
// Tiles skips them), so only video cards are badged for now.

const DONE_ATTR = "data-ib-sfmoney";
const HOST_CLASS = "sfmoney-badge-host";
const BAR_HOST_CLASS = "sfmoney-bar-host";
const RESCAN_MS = 600;
// Per-viewer preference for the float toggle; on unless the creator turned it off.
const FLOAT_KEY = "ib-sfmoney-float";

type Card = {
  tile: StorefrontTile;
  host: HTMLElement | null;
  body: HTMLElement | null;
  // floatRank() of the last render: 0 means the card keeps its natural position.
  rank: number;
};

export type StorefrontMoneyOptions = {
  // Flag products on a deal (the dealSignals tool switch).
  deals: boolean;
};

let controller: AbortController | null = null;

export function initStorefrontMoney(options: StorefrontMoneyOptions = { deals: true }): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}, .${BAR_HOST_CLASS}`))) {
    host.remove();
  }
  for (const marked of Array.from(document.querySelectorAll<HTMLElement>(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
    marked.style.order = "";
  }
  void start(run.signal, options);
}

async function readFloatPref(): Promise<boolean> {
  try {
    const raw = await chrome.storage.local.get(FLOAT_KEY);
    return raw[FLOAT_KEY] !== false;
  } catch {
    return true;
  }
}

function saveFloatPref(on: boolean): void {
  try {
    void chrome.storage.local.set({ [FLOAT_KEY]: on });
  } catch {
    // Preference only; the toggle still works for this page view.
  }
}

async function start(signal: AbortSignal, options: StorefrontMoneyOptions): Promise<void> {
  const marketplace = marketplaceFromUrl(location.href);
  const currency = currencyForMarketplace(marketplace);
  const loaded = loadFilters(await getCache());
  const dealsOn = options.deals && Boolean(loaded.deals);
  if (signal.aborted || (!loaded.cc && !loaded.spcc && !dealsOn)) return;

  // An open Amazon event (Prime Day / Prime Big Deal Days) names the deal chip.
  const remote = await getFlags().catch(() => null);
  const eventOpen = activeDealEvent(remote?.events, retailerOfMarketplace(marketplace)) !== null;
  let floatOn = await readFloatPref();
  if (signal.aborted) return;

  // Per page view: bloom flags per ASIN, the rate tables fetched so far, and
  // which ASINs were already asked for (a lookup is never repeated).
  const ccFlagged = new Set<string>();
  const spccFlagged = new Set<string>();
  const dealFlagged = new Set<string>();
  const ccRates: Record<string, CcRate> = {};
  const spccRates: Record<string, SpccRate> = {};
  const asked = new Set<string>();
  const cards: Card[] = [];
  const bar: BarState = { host: null, button: null, count: null };

  const toggle = (next: boolean): void => {
    floatOn = next;
    saveFloatPref(next);
    applyFloat(cards, bar, floatOn, toggle);
  };

  const renderAll = (): void => {
    for (const card of cards) {
      render(card, currency, eventOpen, {
        ccFlagged,
        spccFlagged,
        dealFlagged,
        ccRates,
        spccRates,
      });
    }
    applyFloat(cards, bar, floatOn, toggle);
  };

  const pass = async (): Promise<void> => {
    const fresh = parseStorefrontTiles(document).filter((tile) => !tile.el.getAttribute(DONE_ATTR));
    if (fresh.length === 0) return;
    const wantCc: string[] = [];
    const wantSpcc: string[] = [];
    for (const tile of fresh) {
      tile.el.setAttribute(DONE_ATTR, "1");
      let hit = false;
      for (const raw of tile.taggedAsins) {
        const asin = raw.toUpperCase();
        const flags = membership(loaded, asin);
        if (flags.cc) {
          ccFlagged.add(asin);
          hit = true;
          if (!asked.has(`cc:${asin}`)) wantCc.push(asin);
        }
        if (flags.spcc) {
          spccFlagged.add(asin);
          hit = true;
          if (!asked.has(`spcc:${asin}`)) wantSpcc.push(asin);
        }
        if (dealsOn && flags.deals) {
          dealFlagged.add(asin);
          hit = true;
        }
      }
      if (hit) cards.push({ tile, host: null, body: null, rank: 0 });
    }
    // Paint the plain "Campaign" chips right away, then upgrade them with terms.
    renderAll();

    const ccAsins = [...new Set(wantCc)];
    const spccAsins = [...new Set(wantSpcc)];
    for (const a of ccAsins) asked.add(`cc:${a}`);
    for (const a of spccAsins) asked.add(`spcc:${a}`);

    const lookups: Array<Promise<void>> = [];
    if (ccAsins.length > 0) {
      lookups.push(
        sendToBackground<CcRatesResult>({ kind: "LOOKUP_CC_RATES", asins: ccAsins })
          .then((res) => {
            if (signal.aborted || !res.ok) return;
            // Bloom filters have ~1% false positives and campaigns end: when the
            // rate table is serving data and has no row, drop the flag.
            const serving = Object.keys(res.rates).length > 0;
            for (const asin of ccAsins) {
              const rate = res.rates[asin];
              if (rate) ccRates[asin] = rate;
              else if (serving) ccFlagged.delete(asin);
            }
          })
          .catch(() => undefined),
      );
    }
    if (spccAsins.length > 0) {
      lookups.push(
        sendToBackground<SpccRatesResult>({ kind: "LOOKUP_SPCC_RATES", asins: spccAsins })
          .then((res) => {
            if (signal.aborted || !res.ok) return;
            const serving = Object.keys(res.rates).length > 0;
            for (const asin of spccAsins) {
              const rate = res.rates[asin];
              if (rate) spccRates[asin] = rate;
              else if (serving) spccFlagged.delete(asin);
            }
          })
          .catch(() => undefined),
      );
    }
    if (lookups.length > 0) {
      await Promise.all(lookups);
      if (!signal.aborted) renderAll();
    }
  };

  await pass();
  if (signal.aborted) return;

  // The storefront lazy-loads cards as the user scrolls and rebuilds on SPA
  // navigation; re-run on a debounced observer. Marked cards are skipped, so
  // the extra passes our own badge insertions trigger cost nothing.
  const startedFor = location.href;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (signal.aborted || location.href !== startedFor) {
      observer.disconnect();
      return;
    }
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      void pass();
    }, RESCAN_MS);
  });
  observer.observe(document.querySelector("main") ?? document.body, {
    childList: true,
    subtree: true,
  });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}

function render(
  card: Card,
  currency: string,
  eventOpen: boolean,
  state: Omit<CardCampaignInput, "asins">,
): void {
  const summary = summarizeCard({
    asins: card.tile.taggedAsins.map((a) => a.toUpperCase()),
    ...state,
  });
  card.rank = floatRank(summary);
  if (!summary) {
    card.host?.remove();
    card.host = null;
    card.body = null;
    return;
  }
  // A re-render replaced the card node's children: remount the badge if ours is gone.
  if (!card.host || !card.host.isConnected) mount(card);
  const body = card.body;
  if (!body) return;
  body.replaceChildren(...chips(summary, currency, eventOpen));
}

function chips(
  summary: CardCampaignSummary,
  currency: string,
  eventOpen: boolean,
): HTMLElement[] {
  const out: HTMLElement[] = [];
  const now = new Date();
  if (summary.cc) {
    const rate = summary.cc.rate;
    const end = campaignEnd(rate?.endsAt, now);
    out.push(
      el(
        "span",
        "tile-chip good",
        !rate
          ? t().tileCampaign
          : end
            ? t().tileCampaignRateEnds(rate.ratePct, formatEndDay(end.day, now))
            : t().tileCampaignRate(rate.ratePct),
      ),
    );
  }
  if (summary.spcc && (summary.spcc.rate || !summary.cc)) {
    const rate = summary.spcc.rate;
    out.push(
      el(
        "span",
        "tile-chip good",
        rate ? t().tileSpccClicks(formatMoney(rate.epc, currency)) : t().tileCampaign,
      ),
    );
  }
  if (summary.deal) {
    out.push(el("span", "tile-chip good", eventOpen ? t().tileDealPrimeDay : t().tileDeal));
  }
  if (summary.products > 1) out.push(el("span", "tile-chip muted", `+${summary.products - 1}`));
  return out;
}

function mount(card: Card): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const wrap = el("div", "tile-badge");
  const body = el("div", "tile-badge-body");
  wrap.append(body);
  root.append(wrap);

  // Top-left, just under the Video Likes heart (top: 6px); the earnings badge owns
  // the bottom-left and Amazon's own controls the bottom-right. Click-through so
  // the chips never block the card's own video / product links.
  const cardEl = card.tile.el;
  if (getComputedStyle(cardEl).position === "static") cardEl.style.position = "relative";
  host.style.position = "absolute";
  host.style.left = "6px";
  host.style.top = "36px";
  host.style.right = "6px";
  host.style.width = "auto";
  host.style.zIndex = "5";
  host.style.pointerEvents = "none";
  cardEl.append(host);

  card.host = host;
  card.body = body;
}

type BarState = {
  host: HTMLElement | null;
  button: HTMLButtonElement | null;
  count: HTMLElement | null;
};

// Float ranked cards to the top of their grid with CSS `order` (grid and flex
// items both honor it), and keep the toggle bar above the grid in sync. React
// owns the grid's children, so nothing is moved in the DOM: clearing `order`
// puts every card straight back.
function applyFloat(
  cards: Card[],
  bar: BarState,
  on: boolean,
  onToggle: (next: boolean) => void,
): void {
  const live = cards
    .filter((c) => c.tile.el.isConnected)
    .sort((a, b) =>
      a.tile.el.compareDocumentPosition(b.tile.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  const orders = floatOrders(live.map((c) => c.rank));
  live.forEach((card, i) => {
    card.tile.el.style.order = on && orders[i] !== 0 ? String(orders[i]) : "";
  });

  const floated = live.filter((c) => c.rank > 0).length;
  const grid = live[0]?.tile.el.parentElement ?? null;
  if (floated === 0 || !grid || !grid.parentElement) {
    bar.host?.remove();
    bar.host = null;
    bar.button = null;
    bar.count = null;
    return;
  }
  if (!bar.host || !bar.host.isConnected || bar.host.nextElementSibling !== grid) {
    bar.host?.remove();
    mountBar(bar, grid, onToggle);
  }
  bar.button?.setAttribute("aria-pressed", String(on));
  if (bar.count) bar.count.textContent = on ? t().sfFloatCount(floated) : "";
}

function mountBar(bar: BarState, grid: HTMLElement, onToggle: (next: boolean) => void): void {
  const { host, root } = createInlineShadow(BAR_HOST_CLASS);
  const wrap = el("div", "sfmoney-bar");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sfmoney-float";
  const dot = el("span", "sfmoney-dot", "");
  dot.setAttribute("aria-hidden", "true");
  button.append(dot, el("span", "", t().sfFloatLabel));
  const count = el("span", "sfmoney-count", "");
  button.addEventListener("click", () => {
    onToggle(button.getAttribute("aria-pressed") !== "true");
  });
  wrap.append(button, count);
  root.append(wrap);
  grid.parentElement?.insertBefore(host, grid);
  bar.host = host;
  bar.button = button;
  bar.count = count;
}
