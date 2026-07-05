import {
  ORDER_HARVEST_PAGE_CAP,
  ORDER_HARVEST_START_YEAR,
} from "../../shared/constants";
import { fetchDoc } from "../../amazon/html-fetch";
import { queryAll } from "../../amazon/selectors";
import { addSection, el } from "../../ui/components";
import { getState, patchSettings, patchState } from "../../storage/store";
import { sendToBackground } from "../../shared/messages";
import type { Finding, OrderFinding } from "../../transport/types";
import { log } from "../../shared/log";

// Orders Butler, in the browser. This is the extension counterpart to the
// desktop runner: it walks the signed-in account's Amazon order history page
// by page and records every line item, syncing them to the connected account
// through the same finding pipeline the other tools use. Because it runs
// against whatever Amazon session the browser is in, it harvests "whichever
// account is signed in" with zero credential handling, exactly like the
// desktop runner.
//
// It runs in the content script (not the background worker): a full catch-up
// can take minutes, and the MV3 service worker is killed after ~30s idle, so
// the walk lives on the order-history page's own lifetime. The tab must stay
// open during a full run; incremental runs stop at the cached cursor and
// finish in seconds.

const ASIN_HREF_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;
const ORDER_ID_RE = /\b\d{3}-\d{7}-\d{7}\b/;
const PAGE_SIZE = 10;

type HarvestScope = "new" | "all";

type LineItem = {
  asin: string;
  title: string;
  priceCents: number | null;
};

type ParsedOrder = {
  orderId: string;
  orderDate: string | null; // YYYY-MM-DD
  items: LineItem[];
};

export function initOrdersButler(marketplace: string): void {
  const section = addSection("Orders Butler");

  const intro = el("p", "note");
  intro.textContent =
    "Pull your full Amazon order history into your dashboard, the same as the desktop runner. It uses whichever Amazon account this browser is signed into, so it works on an account you manage (for example a family member's) just by signing in here first.";
  section.append(intro);

  const scopeRow = el("label", "note");
  scopeRow.textContent = "Scope: ";
  const scopeSelect = el("select") as HTMLSelectElement;
  scopeSelect.append(
    new Option("Only new since last run", "new"),
    new Option("All years (full catch-up)", "all"),
  );
  scopeRow.append(scopeSelect);
  section.append(scopeRow);

  const button = el("button", "btn");
  button.textContent = "Sync my orders";
  const progress = el("p", "progress");
  section.append(button, progress);

  // Re-auth banner: shown when Amazon bounces a page to sign-in mid-walk.
  const authBanner = el("div", "note");
  authBanner.hidden = true;
  const authText = el("span");
  authText.textContent = "Amazon needs you to sign in. Sign in on this tab, then ";
  const resumeBtn = el("button", "btn");
  resumeBtn.textContent = "Resume";
  authBanner.append(authText, resumeBtn);
  section.append(authBanner);

  const resultsList = el("ul", "list");
  section.append(resultsList);

  // Reflect the saved scope and persist changes so the popup and the panel
  // agree on one setting.
  void getState().then((s) => {
    scopeSelect.value = s.settings.orderHarvestScope;
  });
  scopeSelect.addEventListener("change", () => {
    void patchSettings({ orderHarvestScope: scopeSelect.value as HarvestScope });
  });

  let abort: AbortController | null = null;
  let resumeResolver: (() => void) | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  resumeBtn.addEventListener("click", () => {
    authBanner.hidden = true;
    resumeResolver?.();
    resumeResolver = null;
  });

  const waitForResume = (): Promise<void> => {
    authBanner.hidden = false;
    return new Promise((resolve) => {
      resumeResolver = resolve;
    });
  };

  button.addEventListener("click", () => {
    button.disabled = true;
    scopeSelect.disabled = true;
    abort = new AbortController();
    const scope = scopeSelect.value as HarvestScope;
    void runHarvest(scope, marketplace, progress, resultsList, waitForResume, abort.signal)
      .catch((error) => {
        if (!abort?.signal.aborted) log("orders-butler", "harvest failed", error);
      })
      .finally(() => {
        button.disabled = false;
        scopeSelect.disabled = false;
        button.textContent = "Sync again";
      });
  });
}

async function runHarvest(
  scope: HarvestScope,
  marketplace: string,
  progress: HTMLElement,
  resultsList: HTMLElement,
  waitForResume: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const state = await getState();
  const cursor = state.orderCursors[marketplace];
  const stopAtCursor = scope === "new" && Boolean(cursor?.lastOrderId);

  const basePath = orderHistoryBasePath();
  const filterParam = basePath.startsWith("/your-orders") ? "timeFilter" : "orderFilter";
  const detectedAt = new Date().toISOString();

  resultsList.replaceChildren();
  let pageCount = 0;
  let orderCount = 0;
  let itemCount = 0;
  let newestOrderId: string | null = null;
  let reachedCursor = false;

  const currentYear = new Date().getFullYear();

  outer: for (let year = currentYear; year >= ORDER_HARVEST_START_YEAR; year--) {
    let startIndex = 0;
    for (;;) {
      if (signal.aborted) break outer;
      if (pageCount >= ORDER_HARVEST_PAGE_CAP) {
        log("orders-butler", `page cap ${ORDER_HARVEST_PAGE_CAP} hit, stopping`);
        break outer;
      }

      const url = pageUrl(basePath, filterParam, `year-${year}`, startIndex);
      progress.textContent = `Reading ${year}, page ${Math.floor(startIndex / PAGE_SIZE) + 1} (${orderCount} orders so far)...`;

      let doc: Document;
      try {
        doc = await fetchDoc(url, signal);
      } catch (error) {
        if (signal.aborted) break outer;
        log("orders-butler", `fetch failed for ${url}`, error);
        break; // give up on this year, move to the next
      }

      // Amazon bounced us to sign-in: pause and let the user re-auth, then
      // retry the same page. Mirrors the desktop runner's Login/Resume.
      if (isLoginPage(doc)) {
        progress.textContent = "Waiting for Amazon sign-in...";
        await waitForResume();
        if (signal.aborted) break outer;
        continue; // refetch same startIndex
      }

      pageCount += 1;
      const orders = parseOrdersFromDoc(doc);
      if (orders.length === 0) break; // no more orders in this year

      for (const order of orders) {
        if (newestOrderId === null) newestOrderId = order.orderId;
        if (stopAtCursor && order.orderId === cursor?.lastOrderId) {
          reachedCursor = true;
          break outer;
        }
        orderCount += 1;
        for (const item of order.items) {
          const finding: OrderFinding = {
            type: "order",
            orderId: order.orderId,
            orderDate: order.orderDate,
            marketplace,
            asin: item.asin,
            title: item.title.slice(0, 200),
            priceCents: item.priceCents,
            currency: "USD",
            detectedAt,
          };
          void sendToBackground<void>({
            kind: "RECORD_FINDING",
            finding: finding as Finding,
          }).catch(() => {
            // background may be waking; the queue is client-side, next sync resends
          });
          itemCount += 1;
        }
      }

      appendOrderRows(resultsList, orders);
      startIndex += PAGE_SIZE;
    }
  }

  // Advance the cursor to the newest order we saw so the next incremental run
  // stops here. Only meaningful when we actually found orders.
  if (newestOrderId) {
    await patchState((s) => {
      s.orderCursors[marketplace] = {
        lastOrderId: newestOrderId as string,
        lastHarvestAt: Date.now(),
      };
    });
  }

  progress.textContent = signal.aborted
    ? `Stopped. ${itemCount} items from ${orderCount} orders synced so far.`
    : reachedCursor
      ? `Up to date. ${itemCount} new items from ${orderCount} orders synced.`
      : orderCount > 0
        ? `Done. ${itemCount} items from ${orderCount} orders synced to your dashboard.`
        : "Done. No orders found on this account.";
}

// Parse an order-history document into orders and their line items. Defensive
// by design: Amazon reshuffles this markup often, so we lean on the order-id
// regex and the ASIN href pattern (both stable) rather than brittle class
// names, and skip anything we cannot key confidently.
function parseOrdersFromDoc(doc: Document): ParsedOrder[] {
  const cards = queryAll<HTMLElement>(doc, "orderCard");
  const scope: HTMLElement[] = cards.length > 0 ? cards : [doc.body];
  const out: ParsedOrder[] = [];
  const seenOrders = new Set<string>();

  for (const card of scope) {
    const text = card.textContent ?? "";
    const orderId = text.match(ORDER_ID_RE)?.[0] ?? orderIdFromLinks(card);
    if (!orderId || seenOrders.has(orderId)) continue;
    seenOrders.add(orderId);

    const items = extractItems(card);
    if (items.length === 0) continue;

    out.push({ orderId, orderDate: extractOrderDate(card), items });
  }
  return out;
}

function extractItems(card: HTMLElement): LineItem[] {
  const seen = new Set<string>();
  const items: LineItem[] = [];
  const anchors = card.querySelectorAll<HTMLAnchorElement>(
    "a[href*='/dp/'], a[href*='/gp/product/']",
  );
  for (const anchor of Array.from(anchors)) {
    const match = (anchor.getAttribute("href") ?? "").match(ASIN_HREF_RE);
    if (!match || !match[1] || seen.has(match[1])) continue;
    const title = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (title.length < 8) continue; // skip thumbnail and icon links, keep title links
    seen.add(match[1]);
    items.push({ asin: match[1], title, priceCents: priceForItem(anchor) });
  }
  return items;
}

// Best-effort per-item price. Order-history markup varies and an order can
// hold several items, so we scope to the item's own line-item row and only
// trust a price when the row shows exactly one: an order total, a strikethrough
// "was" price, or a neighbour's price would all make the number wrong, so any
// ambiguity yields null rather than a misleading figure.
function priceForItem(anchor: HTMLAnchorElement): number | null {
  const row =
    anchor.closest<HTMLElement>(
      ".a-fixed-left-grid, .a-fixed-right-grid, [class*='item-view'], [class*='shipment-item'], [class*='order-item']",
    ) ?? anchor.parentElement;
  if (!row) return null;

  const prices = new Set<string>();
  for (const priceEl of Array.from(row.querySelectorAll(".a-price > .a-offscreen"))) {
    const text = priceEl.textContent?.trim();
    if (text && /^[$£€]/.test(text)) prices.add(text);
  }
  if (prices.size === 0) {
    const tokens = (row.textContent ?? "").match(/\$[\d,]+\.\d{2}/g);
    if (tokens) for (const token of tokens) prices.add(token);
  }
  if (prices.size !== 1) return null; // none, or ambiguous: do not guess
  return toCents([...prices][0] as string);
}

function toCents(price: string): number | null {
  const cleaned = price.replace(/[^\d.]/g, "");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function orderIdFromLinks(card: HTMLElement): string | null {
  for (const anchor of Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    const match = href.match(/orderI[dD]=(\d{3}-\d{7}-\d{7})/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractOrderDate(card: HTMLElement): string | null {
  const text = card.textContent ?? "";
  // Amazon renders the placed date as "Month DD, YYYY" near the card header.
  const match = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/,
  );
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function appendOrderRows(list: HTMLElement, orders: ParsedOrder[]): void {
  for (const order of orders) {
    const li = el("li");
    const title = order.items[0]?.title ?? "Order";
    li.append(el("span", "t", title.slice(0, 60)));
    const detail = el("span");
    const extra = order.items.length > 1 ? ` +${order.items.length - 1} more` : "";
    detail.textContent = `${order.orderDate ?? "date unknown"}${extra}`;
    li.append(detail);
    list.append(li);
  }
}

function orderHistoryBasePath(): string {
  const path = location.pathname;
  if (path.startsWith("/gp/css/order-history")) return "/gp/css/order-history";
  return "/your-orders/orders";
}

function pageUrl(
  basePath: string,
  filterParam: string,
  filterValue: string,
  startIndex: number,
): string {
  const url = new URL(basePath, location.origin);
  url.searchParams.set(filterParam, filterValue);
  url.searchParams.set("startIndex", String(startIndex));
  return url.toString();
}

function isLoginPage(doc: Document): boolean {
  if (doc.querySelector("form[name='signIn'], input#ap_email, input#ap_password")) {
    return true;
  }
  const title = doc.title.toLowerCase();
  return title.includes("sign-in") || title.includes("amazon sign in");
}
