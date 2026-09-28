import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import logoUrl from "../../../static/icons/icon-48.png";

// The strip above an Idea List's product grid: how many products are scored,
// the enrichment progress line, and a Stop for the automatic product-page
// checks. No sort or filter: an idea list is somebody's short curated list
// and reordering it is not useful. Pure UI; the overlay owns the row model.

export type IdeaListToolbarCallbacks = {
  count: number;
  onStop: () => void;
};

export type IdeaListToolbar = {
  host: HTMLElement;
  setStatus: (text: string) => void;
  // Hides the Stop button once the automatic pass has finished.
  setRunning: (running: boolean) => void;
};

export function renderIdeaListToolbar(cb: IdeaListToolbarCallbacks): IdeaListToolbar {
  const { host, root } = createInlineShadow("idealist-toolbar-host");
  const bar = el("div", "search-toolbar");

  const brand = el("div", "search-brand");
  const logo = el("img", "search-logo");
  logo.src = logoUrl;
  logo.alt = "";
  brand.append(logo, el("span", "search-count", t().storeCount(cb.count)));

  const scanWrap = el("div", "search-control search-scan");
  const stopBtn = el("button", "btn secondary");
  stopBtn.type = "button";
  stopBtn.textContent = t().searchScanStop;
  stopBtn.addEventListener("click", () => cb.onStop());
  const status = el("span", "search-status");
  scanWrap.append(stopBtn, status);

  bar.append(brand, scanWrap);
  root.append(bar);

  return {
    host,
    setStatus: (text) => {
      status.textContent = text;
    },
    setRunning: (running) => {
      stopBtn.style.display = running ? "" : "none";
    },
  };
}
