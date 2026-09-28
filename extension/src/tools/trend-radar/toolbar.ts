import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import logoUrl from "../../../static/icons/icon-48.png";

// The bar Trend Radar drops above a discovery grid (Best Sellers / New Releases
// / Movers & Shakers): sort by what is rising fastest, by rank, by Butler Score
// or commission; filter to the products with an open video slot; and kick off
// the same paced per-tile video scan the search overlay uses. Pure UI: every
// action calls back into the overlay, which owns the row model and the reorder.
// Reuses the search-toolbar styles so no new CSS is needed.

export type TrendSortKey = "trending" | "rank" | "score" | "commission";
export type TrendFilterState = { fewVideosOnly: boolean };

export type TrendToolbarCallbacks = {
  count: number;
  onSort: (key: TrendSortKey) => void;
  onFilter: (state: TrendFilterState) => void;
  onScanStart: (setStatus: (text: string) => void) => Promise<void>;
  onScanStop: () => void;
};

export function renderTrendToolbar(cb: TrendToolbarCallbacks): HTMLElement {
  const { host, root } = createInlineShadow("search-toolbar-host");
  const bar = el("div", "search-toolbar");

  const brand = el("div", "search-brand");
  const logo = el("img", "search-logo");
  logo.src = logoUrl;
  logo.alt = "";
  brand.append(logo, el("span", "search-count", t().trendCount(cb.count)));

  // Sort control: lead with Trending (the discovery-only signal).
  const sortWrap = el("label", "search-control");
  sortWrap.append(el("span", "search-control-label", t().searchSortLabel));
  const sort = el("select");
  const sortOptions: Array<[TrendSortKey, string]> = [
    ["trending", t().trendSortTrending],
    ["rank", t().trendSortRank],
    ["score", t().sortScore],
    ["commission", t().sortCommission],
  ];
  for (const [value, label] of sortOptions) {
    const opt = el("option");
    opt.value = value;
    opt.textContent = label;
    sort.append(opt);
  }
  sort.addEventListener("change", () => cb.onSort(sort.value as TrendSortKey));
  sortWrap.append(sort);

  // Filter: only products with an open video slot (needs the scan to know).
  const state: TrendFilterState = { fewVideosOnly: false };
  const fewWrap = el("label", "search-control search-check");
  const few = el("input");
  few.type = "checkbox";
  few.addEventListener("change", () => {
    state.fewVideosOnly = few.checked;
    cb.onFilter({ ...state });
  });
  fewWrap.append(few, el("span", "", t().trendFewVideosOnly));

  // Video scan: opt-in, paced, with a Stop, identical to the search overlay.
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

  bar.append(brand, sortWrap, fewWrap, scanWrap);
  root.append(bar);
  return host;
}
