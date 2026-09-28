import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import logoUrl from "../../../static/icons/icon-48.png";

// The bar above a brand store's product grid: how many products are scored,
// how many are green-boxed candidates, the enrich/scan progress line, a Stop
// for the automatic scans, and a hide-only "candidates only" filter. No sort:
// the store grid is a live React tree and reordering its cards breaks it
// (same rule as Campaign Radar). Pure UI; the overlay owns the row model.

export type StoreToolbarCallbacks = {
  count: number;
  onFilter: (candidatesOnly: boolean) => void;
  onStop: () => void;
};

export type StoreToolbar = {
  host: HTMLElement;
  setStatus: (text: string) => void;
  setCandidates: (n: number) => void;
  // Hides the Stop button once the automatic passes have finished.
  setRunning: (running: boolean) => void;
};

export function renderStoreToolbar(cb: StoreToolbarCallbacks): StoreToolbar {
  const { host, root } = createInlineShadow("store-toolbar-host");
  const bar = el("div", "search-toolbar");

  const brand = el("div", "search-brand");
  const logo = el("img", "search-logo");
  logo.src = logoUrl;
  logo.alt = "";
  const candidates = el("span", "search-count", t().storeCandidates(0));
  brand.append(logo, el("span", "search-count", t().storeCount(cb.count)), candidates);

  const filterWrap = el("label", "search-control search-check");
  const filter = el("input");
  filter.type = "checkbox";
  filter.addEventListener("change", () => cb.onFilter(filter.checked));
  filterWrap.append(filter, el("span", "", t().storeCandidatesOnly));

  const scanWrap = el("div", "search-control search-scan");
  const stopBtn = el("button", "btn secondary");
  stopBtn.type = "button";
  stopBtn.textContent = t().searchScanStop;
  stopBtn.addEventListener("click", () => cb.onStop());
  const status = el("span", "search-status");
  scanWrap.append(stopBtn, status);

  bar.append(brand, filterWrap, scanWrap);
  root.append(bar);

  return {
    host,
    setStatus: (text) => {
      status.textContent = text;
    },
    setCandidates: (n) => {
      candidates.textContent = t().storeCandidates(n);
    },
    setRunning: (running) => {
      stopBtn.style.display = running ? "" : "none";
    },
  };
}
