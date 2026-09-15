import { extractDeals, matchAmazonProductUrl } from "../tools/deal-harvester/extract";
import { getSettings } from "../storage/store";
import { resolveLocale } from "../i18n";
import { DEALS_CATALOG, type DealsDict } from "../deals/strings";
import { DEAL_HARVEST_RENDER_SETTLE_MS, UI_PREFIX } from "../shared/constants";

// On-page indicator for a known deal-aggregator site (curated or user-saved in
// the Deal Sites Harvester). Dynamically registered by
// background/deal-badge-register.ts ONLY for origins the extension already
// holds host permission for, so this never runs on a site the user has not
// already granted. Reads the page's OWN rendered DOM with the same pure
// extractor the harvester uses server-side of the fetch: a script-rendered
// aggregator (like this one) has already finished rendering by the time a
// content script runs, so no network fetch or background tab is needed here.

void init();

async function init(): Promise<void> {
  // The app's own data fetch can still be in flight when the script first
  // runs (document_idle fires on the initial shell, not on late XHR data), so
  // give it a moment and retry once before concluding the page has no deals.
  let deals = extractDeals(document.documentElement.outerHTML, location.href);
  if (deals.length === 0) {
    await sleep(DEAL_HARVEST_RENDER_SETTLE_MS);
    deals = extractDeals(document.documentElement.outerHTML, location.href);
  }
  if (deals.length === 0) return;

  const settings = await getSettings();
  const D = DEALS_CATALOG[resolveLocale(settings.locale)];
  showBadge(deals.length, D);
  injectPerDealButtons(D);
}

// A small inline button next to EACH Amazon link on the page, so a creator can
// open the review page pre-filled and pre-selected for just that one deal
// instead of the whole page. Scans real <a> elements (not the html-string
// regex sweep extractDeals uses) so each button can be tied to the exact
// link the creator clicked next to; matchAmazonProductUrl is the same
// per-URL match dealFromAmazonUrl uses for a resolved short link.
function injectPerDealButtons(D: DealsDict): void {
  const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const anchor of anchors) {
    if (anchor.dataset.ibDealBtn) continue;
    const match = matchAmazonProductUrl(anchor.href);
    if (!match) continue;
    anchor.dataset.ibDealBtn = "1";
    anchor.insertAdjacentElement("afterend", buildSendButton(match, D));
  }
}

function buildSendButton(match: { asin: string; marketplace: string }, D: DealsDict): HTMLElement {
  const host = document.createElement("span");
  host.className = `${UI_PREFIX}-deal-send-host`;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = SEND_BUTTON_CSS;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "send";
  btn.textContent = D.badgeAction;
  btn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const params = new URLSearchParams({
      add: location.href,
      asin: match.asin,
      marketplace: match.marketplace,
    });
    window.open(chrome.runtime.getURL(`deals.html?${params.toString()}`), "_blank", "noopener");
  };

  root.append(style, btn);
  return host;
}

function showBadge(count: number, D: DealsDict): void {
  const host = document.createElement("div");
  host.className = `${UI_PREFIX}-deal-badge-host`;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const text = document.createElement("span");
  text.className = "count";
  text.textContent = D.badgeCount(count);

  const action = document.createElement("button");
  action.type = "button";
  action.className = "action";
  action.textContent = D.badgeAction;
  action.onclick = () => {
    const url = chrome.runtime.getURL(`deals.html?add=${encodeURIComponent(location.href)}`);
    window.open(url, "_blank", "noopener");
  };

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "×";
  close.setAttribute("aria-label", D.badgeDismiss);
  close.onclick = () => host.remove();

  wrap.append(text, action, close);
  root.append(wrap);
  document.documentElement.append(host);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 10px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #c2410c;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.22);
  padding: 10px 12px;
}
.count { font-weight: 600; white-space: nowrap; }
.action {
  background: #c2410c;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.action:hover { background: #9a3412; }
.close {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.close:hover { color: #4b5563; }
@media (prefers-color-scheme: dark) {
  .wrap { color: #f3f4f6; background: #1f2937; border-color: #374151; }
  .close { color: #9ca3af; }
}
`;

const SEND_BUTTON_CSS = `
:host { all: initial; display: inline-block; vertical-align: middle; margin-left: 6px; }
.send {
  font: 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: 600;
  color: #fff;
  background: #c2410c;
  border: none;
  border-radius: 999px;
  padding: 4px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.send:hover { background: #9a3412; }
`;
