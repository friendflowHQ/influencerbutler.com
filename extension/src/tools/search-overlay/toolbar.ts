import { flashSent, resetSent } from "../../ui/sent-state";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { legend } from "./legend";
import { defaultPrefs, isDefaultPrefs, type ViewPrefs } from "../../shared/view-prefs";
import { initChatBubble } from "../chat-bubble/panel";
import { getLocale } from "../../i18n";
import logoUrl from "../../../static/icons/icon-48.png";

// The bar the overlay drops above the search grid: sort the results by Butler
// Score / commission / price, filter to campaign-eligible or in-budget, and
// kick off the optional per-tile video scan. Pure UI: every action calls back
// into the overlay, which owns the row model and the DOM reordering.

export type SortKey = "score" | "commission" | "revenue" | "price-asc" | "price-desc" | "relevance";
export type FilterState = { campaignOnly: boolean; minPriceCents: number | null };

export type ToolbarCallbacks = {
  count: number;
  // Remembered view (sort, filters, hidden badges). `defaultSort` is what the
  // overlay applies with no saved view; "Reset view" returns to it.
  defaultSort: SortKey;
  initial?: ViewPrefs;
  onViewChange?: (view: ViewPrefs) => void;
  onReset?: () => void;
  onSort: (key: SortKey) => void;
  onFilter: (state: FilterState) => void;
  // Runs the video scan; the overlay reports progress through setStatus and
  // resolves when done or stopped.
  onScanStart: (setStatus: (text: string) => void) => Promise<void>;
  onScanStop: () => void;
  // "Hide badges" toggle: hides every tile's chip row on this page.
  onToggleBadges?: (hidden: boolean) => void;
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
  // Put the controls back to a view (used by "Reset view").
  setView: (view: ViewPrefs) => void;
  // "Why is this first?" line under the bar; null hides it.
  setTopPickReason: (text: string | null) => void;
  // "Data updated 2h ago" label; `stale` adds the out-of-date words.
  setDataUpdated: (text: string | null, stale: boolean) => void;
  // Page-level lookup failure notice with a Retry button; hidden when `show` is false.
  setLookupIssue: (show: boolean, onRetry: () => void) => void;
};

const RESET_EN = "Reset view";
const RESET_COPY: Record<string, string> = { en: RESET_EN, es: "Restablecer vista", fr: "Reinitialiser la vue" };

type IssueCopy = { text: string; retry: string };
const ISSUE_EN: IssueCopy = { text: "Some estimates did not load.", retry: "Retry" };
const ISSUE_COPY: Record<string, IssueCopy> = {
  en: ISSUE_EN,
  es: { text: "Algunas estimaciones no se cargaron.", retry: "Reintentar" },
  fr: { text: "Certaines estimations ne se sont pas chargees.", retry: "Reessayer" },
};

type ReportCopy = { button: string; title: string; intro: string };
const REPORT_EN: ReportCopy = { button: "Report a problem", title: "Problem with the search page badges", intro: "What looked wrong on this page?" };
const REPORT_COPY: Record<string, ReportCopy> = {
  en: REPORT_EN,
  es: { button: "Informar de un problema", title: "Problema con las insignias de la pagina de busqueda", intro: "Que se veia mal en esta pagina?" },
  fr: { button: "Signaler un probleme", title: "Probleme avec les badges de la page de recherche", intro: "Qu'est-ce qui semblait incorrect sur cette page ?" },
};

export function renderToolbar(cb: ToolbarCallbacks): SearchToolbar {
  const { host, root } = createInlineShadow("search-toolbar-host");
  const bar = el("div", "search-toolbar");

  const brand = el("div", "search-brand");
  const logo = el("img", "search-logo");
  logo.src = logoUrl;
  logo.alt = "";
  brand.append(logo, el("span", "search-count", t().searchCount(cb.count)));

  // The current view, remembered across searches (see shared/view-prefs.ts).
  const view: ViewPrefs = { ...(cb.initial ?? defaultPrefs(cb.defaultSort)) };
  let saveTimer = 0;
  let refreshReset: () => void = () => undefined;
  const viewChanged = (): void => {
    refreshReset();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => cb.onViewChange?.({ ...view }), 300);
  };

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
  sort.value = view.sort;
  sort.addEventListener("change", () => {
    view.sort = sort.value as SortKey;
    cb.onSort(view.sort);
    viewChanged();
  });
  sortWrap.append(sort);

  // Filters: campaign-eligible only + minimum price.
  const state: FilterState = { campaignOnly: view.campaignOnly, minPriceCents: view.minPriceCents };
  const campaignWrap = el("label", "search-control search-check");
  const campaign = el("input");
  campaign.type = "checkbox";
  campaign.checked = state.campaignOnly;
  campaign.addEventListener("change", () => {
    state.campaignOnly = campaign.checked;
    view.campaignOnly = state.campaignOnly;
    cb.onFilter({ ...state });
    viewChanged();
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
  price.value = state.minPriceCents !== null ? String(state.minPriceCents / 100) : "";
  price.addEventListener("change", () => {
    const dollars = parseFloat(price.value);
    state.minPriceCents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
    view.minPriceCents = state.minPriceCents;
    cb.onFilter({ ...state });
    viewChanged();
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

  // Shown when a page-level lookup (estimates, campaign rates) failed, so a
  // missing chip is never a silent mystery. Retry re-runs only what failed.
  const dataAge = el("span", "search-status search-data-age");
  dataAge.hidden = true;
  const issueCopy = ISSUE_COPY[String(getLocale()).slice(0, 2)] ?? ISSUE_EN;
  const issueWrap = el("span", "search-control search-lookup-issue");
  issueWrap.setAttribute("role", "status");
  issueWrap.hidden = true;
  const issueText = el("span", "search-status", issueCopy.text);
  const issueBtn = el("button", "btn secondary small", issueCopy.retry) as HTMLButtonElement;
  issueBtn.type = "button";
  let issueRetry: () => void = () => undefined;
  issueBtn.addEventListener("click", () => issueRetry());
  issueWrap.append(issueText, issueBtn);

  bar.append(brand, sortWrap);
  if (cb.showCampaignFilter !== false) bar.append(campaignWrap);
  bar.append(priceWrap);
  if (cb.showScan !== false) bar.append(scanWrap);
  if (cb.showSendDeals && cb.onSendDeals) bar.append(sendWrap);
  if (cb.onAcceptAll) bar.append(acceptWrap);
  bar.append(enrichStatus, dataAge, issueWrap);

  // "?" key to the chips: a toggled panel under the bar, keyboard reachable.
  const lg = legend();
  const keyBtn = el("button", "btn secondary small") as HTMLButtonElement;
  keyBtn.type = "button";
  keyBtn.textContent = `? ${lg.button}`;
  keyBtn.setAttribute("aria-expanded", "false");
  const keyPanel = el("div", "search-legend");
  keyPanel.hidden = true;
  keyPanel.append(el("strong", "", lg.title));
  const keyList = el("ul");
  for (const row of lg.rows) {
    const li = el("li");
    li.append(el("b", "", `${row.chip}: `), document.createTextNode(row.text));
    keyList.append(li);
  }
  keyPanel.append(keyList);
  keyBtn.addEventListener("click", () => {
    keyPanel.hidden = !keyPanel.hidden;
    keyBtn.setAttribute("aria-expanded", String(!keyPanel.hidden));
  });
  bar.append(keyBtn);
  let paintHideBtn: (hidden: boolean) => void = () => undefined;
  if (cb.onToggleBadges) {
    const hideBtn = el("button", "btn secondary small") as HTMLButtonElement;
    hideBtn.type = "button";
    paintHideBtn = (hidden: boolean) => {
      hideBtn.textContent = hidden ? lg.showBadges : lg.hideBadges;
      hideBtn.setAttribute("aria-pressed", String(hidden));
    };
    paintHideBtn(view.badgesHidden);
    hideBtn.addEventListener("click", () => {
      view.badgesHidden = !view.badgesHidden;
      cb.onToggleBadges?.(view.badgesHidden);
      paintHideBtn(view.badgesHidden);
      viewChanged();
    });
    bar.append(hideBtn);
  }

  // "Reset view": only shown while the view differs from the default.
  const resetCopy = RESET_COPY[String(getLocale()).slice(0, 2)] ?? RESET_EN;
  const resetBtn = el("button", "btn secondary small", resetCopy) as HTMLButtonElement;
  resetBtn.type = "button";
  refreshReset = () => {
    resetBtn.hidden = isDefaultPrefs(view, cb.defaultSort);
  };
  const applyView = (next: ViewPrefs): void => {
    Object.assign(view, next);
    sort.value = view.sort;
    campaign.checked = view.campaignOnly;
    state.campaignOnly = view.campaignOnly;
    state.minPriceCents = view.minPriceCents;
    price.value = view.minPriceCents !== null ? String(view.minPriceCents / 100) : "";
    paintHideBtn(view.badgesHidden);
    refreshReset();
  };
  resetBtn.addEventListener("click", () => {
    applyView(defaultPrefs(cb.defaultSort));
    cb.onReset?.();
  });
  refreshReset();
  bar.append(resetBtn);
  // "Report a problem": opens the Feedback form with this page's context filled in.
  const reportCopy = REPORT_COPY[String(getLocale()).slice(0, 2)] ?? REPORT_EN;
  const reportBtn = el("button", "btn secondary small") as HTMLButtonElement;
  reportBtn.type = "button";
  reportBtn.textContent = reportCopy.button;
  reportBtn.addEventListener("click", () => {
    initChatBubble();
    const tiles = cb.count;
    window.dispatchEvent(
      new CustomEvent("ib-open-report", {
        detail: {
          title: reportCopy.title,
          description: `${reportCopy.intro}

Page: ${location.href}
Tiles found: ${tiles}`,
        },
      }),
    );
  });
  bar.append(reportBtn);
  const topLine = el("div", "search-top-reason");
  topLine.setAttribute("role", "status");
  topLine.hidden = true;
  root.append(bar, topLine, keyPanel);
  return {
    host,
    setView: applyView,
    setTopPickReason: (text: string | null) => {
      topLine.hidden = !text;
      topLine.textContent = text ?? "";
    },
    setDataUpdated: (text: string | null, stale: boolean) => {
      dataAge.hidden = !text;
      dataAge.classList.toggle("stale", stale);
      dataAge.textContent = text ? (stale ? `${text} ${legend().source.stale}` : text) : "";
    },
    setLookupIssue: (show: boolean, onRetry: () => void) => {
      issueRetry = onRetry;
      issueWrap.hidden = !show;
    },
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
