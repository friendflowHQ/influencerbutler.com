import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import logoUrl from "../../../static/icons/icon-48.png";

// The bar the overlay drops above the search grid: sort the results by Butler
// Score / commission / price, filter to campaign-eligible or in-budget, and
// kick off the optional per-tile video scan. Pure UI: every action calls back
// into the overlay, which owns the row model and the DOM reordering.

export type SortKey = "score" | "commission" | "revenue" | "price-asc" | "price-desc" | "relevance";
export type FilterState = { campaignOnly: boolean; minPriceCents: number | null };

export type ToolbarCallbacks = {
  count: number;
  onSort: (key: SortKey) => void;
  onFilter: (state: FilterState) => void;
  // Runs the video scan; the overlay reports progress through setStatus and
  // resolves when done or stopped.
  onScanStart: (setStatus: (text: string) => void) => Promise<void>;
  onScanStop: () => void;
};

export type SearchToolbar = {
  host: HTMLElement;
  // Progress line for the automatic detail enrichment ("Checking details
  // 3/12" / the paused notice); empty string clears it.
  setEnrichStatus: (text: string) => void;
};

export function renderToolbar(cb: ToolbarCallbacks): SearchToolbar {
  const { host, root } = createInlineShadow("search-toolbar-host");
  const bar = el("div", "search-toolbar");

  const brand = el("div", "search-brand");
  const logo = el("img", "search-logo");
  logo.src = logoUrl;
  logo.alt = "";
  brand.append(logo, el("span", "search-count", t().searchCount(cb.count)));

  // Sort control.
  const sortWrap = el("label", "search-control");
  sortWrap.append(el("span", "search-control-label", t().searchSortLabel));
  const sort = el("select");
  const sortOptions: Array<[SortKey, string]> = [
    ["score", t().sortScore],
    ["commission", t().sortCommission],
    ["revenue", t().sortRevenue],
    ["price-asc", t().sortPriceAsc],
    ["price-desc", t().sortPriceDesc],
    ["relevance", t().sortRelevance],
  ];
  for (const [value, label] of sortOptions) {
    const opt = el("option");
    opt.value = value;
    opt.textContent = label;
    sort.append(opt);
  }
  sort.addEventListener("change", () => cb.onSort(sort.value as SortKey));
  sortWrap.append(sort);

  // Filters: campaign-eligible only + minimum price.
  const state: FilterState = { campaignOnly: false, minPriceCents: null };
  const campaignWrap = el("label", "search-control search-check");
  const campaign = el("input");
  campaign.type = "checkbox";
  campaign.addEventListener("change", () => {
    state.campaignOnly = campaign.checked;
    cb.onFilter({ ...state });
  });
  campaignWrap.append(campaign, el("span", "", t().searchCampaignOnly));

  const priceWrap = el("label", "search-control");
  priceWrap.append(el("span", "search-control-label", t().searchMinPrice));
  const price = el("input");
  price.type = "number";
  price.min = "0";
  price.step = "5";
  price.placeholder = "0";
  price.className = "search-price";
  price.addEventListener("change", () => {
    const dollars = parseFloat(price.value);
    state.minPriceCents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
    cb.onFilter({ ...state });
  });
  priceWrap.append(price);

  // Video scan: opt-in, paced, with a Stop.
  const scanWrap = el("div", "search-control search-scan");
  const scanBtn = el("button", "btn secondary");
  scanBtn.type = "button";
  scanBtn.textContent = t().searchScan;
  const stopBtn = el("button", "btn secondary");
  stopBtn.type = "button";
  stopBtn.textContent = t().searchScanStop;
  stopBtn.style.display = "none";
  const status = el("span", "search-status");
  const setStatus = (text: string) => {
    status.textContent = text;
  };
  scanBtn.addEventListener("click", () => {
    scanBtn.style.display = "none";
    stopBtn.style.display = "";
    void cb.onScanStart(setStatus).finally(() => {
      stopBtn.style.display = "none";
      scanBtn.style.display = "";
      scanBtn.textContent = t().searchScan;
    });
  });
  stopBtn.addEventListener("click", () => cb.onScanStop());
  scanWrap.append(scanBtn, stopBtn, status);

  // Automatic-enrichment progress, separate from the scan status so the two
  // never overwrite each other.
  const enrichStatus = el("span", "search-status");

  bar.append(brand, sortWrap, campaignWrap, priceWrap, scanWrap, enrichStatus);
  root.append(bar);
  return {
    host,
    setEnrichStatus: (text: string) => {
      enrichStatus.textContent = text;
    },
  };
}
