import { extractDeals } from "../tools/deal-harvester/extract";
import { getSettings } from "../storage/store";
import { getFlags } from "../flags/cache";
import { resolveLocale } from "../i18n";
import { DEALS_CATALOG, type DealsDict } from "../deals/strings";
import {
  DEAL_CHIP_MAX_PER_PAGE,
  DEAL_CHIP_SCAN_DEBOUNCE_MS,
  DEAL_CHIP_SCAN_MAX_WAIT_MS,
  DEAL_HARVEST_RENDER_SETTLE_MS,
  UI_PREFIX,
} from "../shared/constants";
import { askBackground, sendToBackground } from "../shared/messages";
import type { HudCommandResult, ProductRef } from "../transport/hud-commands";
import { allProductAnchors, countProductLinksByAncestor, resolveCardHost } from "./card-scope";
import { canonicalProductUrl } from "../integrations/url";
import { CHIP_HOST_CLASS, mountChip } from "./chip";
import { createSendQueue, type ChipHandle } from "./send";

// On-page tools for a known deal-aggregator site (curated or user-saved in the
// Deal Sites Harvester). Dynamically registered by
// background/deal-badge-register.ts ONLY for origins the extension already
// holds host permission for, so this never runs on a site the user has not
// already granted. Two things live here:
//
// 1. A page-level badge counting the Amazon deals on the page, whose button
//    opens the full review flow (enrichment, branded links, multi-select).
// 2. A "Send to Deals" chip on each product card, which pushes that one deal
//    straight into the Deals Butler workspace in a single click.
//
// Both read the page's OWN rendered DOM: a script-rendered aggregator has
// already drawn itself by the time a content script runs, so no fetch and no
// background tab is needed here.

const ANCHOR_DONE_ATTR = "data-ib-dealchip";
const CARD_DONE_ATTR = "data-ib-dealcard";

let mounted = 0;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanQueuedAt = 0;

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  const D = DEALS_CATALOG[resolveLocale(settings.locale)];

  // The app's own data fetch can still be in flight when the script first
  // runs (document_idle fires on the initial shell, not on late XHR data), so
  // give it a moment and retry once before concluding the page has no deals.
  let deals = extractDeals(document.documentElement.outerHTML, location.href);
  if (deals.length === 0) {
    await sleep(DEAL_HARVEST_RENDER_SETTLE_MS);
    deals = extractDeals(document.documentElement.outerHTML, location.href);
  }
  if (deals.length > 0) showBadge(deals.length, D);

  const flags = await getFlags();
  const killed = flags?.disableAll === true || (flags?.disabledTools.includes("dealChip") ?? false);
  if (killed || !settings.deals.cardChip) return;

  const queue = createSendQueue({
    send: (command) => askBackground<HudCommandResult>({ kind: "SEND_HUD_COMMAND", command }),
    // Read per flush so a workspace or placement changed in the options page
    // takes effect without reloading the deal site.
    target: async () => {
      const current = await getSettings();
      return { workspace: current.deals.workspace, placement: current.deals.placement };
    },
    dict: D,
  });

  const scan = () => injectCardChips(D, queue.enqueue);
  scan();
  watchForRerenders(scan);
}

// Decorate every product card that does not have a chip yet. Incremental by
// design: an already-marked anchor short-circuits before any layout read, so
// re-scanning a settled page costs one querySelectorAll and nothing else.
function injectCardChips(
  D: DealsDict,
  enqueue: (product: ProductRef, chip: ChipHandle) => void,
): void {
  if (mounted >= DEAL_CHIP_MAX_PER_PAGE) return;

  const hits = allProductAnchors();
  if (hits.length === 0) return;
  // Counted across EVERY product anchor, marked ones included: where the card
  // ends is a property of the page, not of what we have decorated so far.
  const counts = countProductLinksByAncestor(hits.map((hit) => hit.anchor));

  for (const hit of hits) {
    if (mounted >= DEAL_CHIP_MAX_PER_PAGE) return;
    if (hit.anchor.hasAttribute(ANCHOR_DONE_ATTR)) continue;
    hit.anchor.setAttribute(ANCHOR_DONE_ATTR, "1");

    const card = resolveCardHost(hit.anchor, counts);
    // Two anchors resolving to one card must not stack two chips on it.
    if (card.hasAttribute(CARD_DONE_ATTR)) continue;

    const product: ProductRef = {
      asin: hit.asin,
      marketplace: hit.marketplace,
      // The desktop persists this rather than rebuilding the url itself, and a
      // Walmart item lives at /ip/ rather than /dp/, so build it per retailer.
      url: canonicalProductUrl(
        hit.asin,
        hit.marketplace,
        "",
        /walmart/.test(hit.marketplace) ? "walmart" : "amazon",
      ),
    };
    // resolveCardHost falls back to the anchor itself when the page has no card
    // around the link, which is what an article-style deal blog looks like.
    const chip = mountChip(
      card,
      D,
      () => enqueue(product, handle),
      card === (hit.anchor as HTMLElement) ? "inline" : "corner",
    );
    if (!chip) continue;
    const handle = chip;
    card.setAttribute(CARD_DONE_ATTR, hit.marketplace + ":" + hit.asin);
    mounted += 1;
  }
}

// These sites are single-page apps: the deal list renders after load and
// re-renders wholesale when the creator switches day tabs, so a one-shot pass
// decorates nothing (or decorates today's cards and then loses them).
function watchForRerenders(scan: () => void): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as Element;
      // Ignore our own mounts, or adding a chip retriggers the observer that
      // added it.
      if (target.closest?.("." + CHIP_HOST_CLASS)) continue;
      schedule(scan);
      return;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Trailing debounce with a ceiling, so a page that mutates continuously still
// gets its chips instead of being starved by the reset.
function schedule(scan: () => void): void {
  if (scanQueuedAt === 0) scanQueuedAt = Date.now();
  if (scanTimer) clearTimeout(scanTimer);
  const waited = Date.now() - scanQueuedAt;
  const delay = Math.max(
    0,
    Math.min(DEAL_CHIP_SCAN_DEBOUNCE_MS, DEAL_CHIP_SCAN_MAX_WAIT_MS - waited),
  );
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanQueuedAt = 0;
    scan();
  }, delay);
}

function showBadge(count: number, D: DealsDict): void {
  const host = document.createElement("div");
  host.className = UI_PREFIX + "-deal-badge-host";
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
    // A content script cannot navigate to deals.html itself (it is not a
    // web_accessible_resource, and we would rather not make it one), so the
    // worker opens the tab.
    void sendToBackground<void>({
      kind: "OPEN_DEALS_PAGE",
      query: "add=" + encodeURIComponent(location.href),
    });
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
