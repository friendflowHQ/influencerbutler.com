import { flashSent, resetSent } from "../../ui/sent-state";
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
  // Controls that only apply to a retailer with the underlying feature. Default
  // true (Amazon); Walmart passes false to hide the video Scan and the
  // campaign-eligible filter, which it has no data for.
  showScan?: boolean;
  showCampaignFilter?: boolean;
  // "Send deals to app": batch-push the page's discounted tiles into the desktop
  // Deals Butler. Shown only when the overlay wires onSendDeals (the
  // Walmart rollback/deals + search grids); the overlay owns the row model and
  // the bridge call, and reports progress through setStatus.
  showSendDeals?: boolean;
  // Resolves true when the app took the batch (the button then shows "Sent").
  onSendDeals?: (setStatus: (text: string) => void) => Promise<boolean | void>;
  // "Accept campaigns on this page (N)": the search-results one-off for
  // Creator Connections. The overlay owns the row model, the confirm step and
  // the (serialized, capped) accept loop; the button appears once at least one
  // visible tile has a known campaign, and its count is kept current through
  // SearchToolbar.setAcceptCount.
  onAcceptAll?: (setStatus: (text: string) => void) => Promise<void>;
};

export type SearchToolbar = {
  host: HTMLElement;
  // Progress line for the automatic detail enrichment ("Checking details
  // 3/12" / the paused notice); empty string clears it.
  setEnrichStatus: (text: string) => void;
  // Update the accept-all button: hidden at 0, otherwise "Accept campaigns on
  // this page (N)".
  setAcceptCount: (count: number) => void;
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

  // "Send deals to app": one click batches the page's discounted tiles into the
  // desktop Deals Butler. Its own status line, and it disables while
  // in flight so a double click cannot double-send.
  const sendWrap = el("div", "search-control search-send-deals");
  const sendBtn = el("button", "btn secondary") as HTMLButtonElement;
  sendBtn.type = "button";
  sendBtn.textContent = t().searchSendDeals;
  const sendStatus = el("span", "search-status");
  sendBtn.addEventListener("click", () => {
    if (!cb.onSendDeals) return;
    resetSent(sendBtn);
    sendBtn.disabled = true;
    void cb.onSendDeals((text) => {
      sendStatus.textContent = text;
    }).then((sent) => {
      if (sent === true) flashSent(sendBtn);
    }).finally(() => {
      sendBtn.disabled = false;
    });
  });
  sendWrap.append(sendBtn, sendStatus);

  // "Accept campaigns on this page": one confirmed click accepts the tiles that
  // carry a known Creator Connections campaign, one at a time through the
  // worker's accept queue. Hidden until the rate lookup finds one.
  const acceptWrap = el("div", "search-control search-accept-all");
  const acceptBtn = el("button", "btn secondary") as HTMLButtonElement;
  acceptBtn.type = "button";
  const acceptStatus = el("span", "search-status");
  let acceptCount = 0;
  acceptWrap.style.display = "none";
  acceptBtn.addEventListener("click", () => {
    if (!cb.onAcceptAll) return;
    acceptBtn.disabled = true;
    void cb
      .onAcceptAll((text) => {
        acceptStatus.textContent = text;
      })
      .finally(() => {
        acceptBtn.disabled = false;
      });
  });
  acceptWrap.append(acceptBtn, acceptStatus);

  // Automatic-enrichment progress, separate from the scan status so the two
  // never overwrite each other.
  const enrichStatus = el("span", "search-status");

  bar.append(brand, sortWrap);
  if (cb.showCampaignFilter !== false) bar.append(campaignWrap);
  bar.append(priceWrap);
  if (cb.showScan !== false) bar.append(scanWrap);
  if (cb.showSendDeals && cb.onSendDeals) bar.append(sendWrap);
  if (cb.onAcceptAll) bar.append(acceptWrap);
  bar.append(enrichStatus);
  root.append(bar);
  return {
    host,
    setEnrichStatus: (text: string) => {
      enrichStatus.textContent = text;
    },
    setAcceptCount: (count: number) => {
      acceptCount = count;
      acceptBtn.textContent = t().acceptAllOnPage(acceptCount);
      acceptWrap.style.display = acceptCount > 0 ? "" : "none";
    },
  };
}
