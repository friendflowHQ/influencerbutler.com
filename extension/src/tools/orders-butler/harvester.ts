import {
  ORDER_HARVEST_PAGE_CAP,
  ORDER_HARVEST_START_YEAR,
} from "../../shared/constants";
import { fetchDoc } from "../../amazon/html-fetch";
import { queryAll } from "../../amazon/selectors";
import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { getState, patchSettings, patchState } from "../../storage/store";
import { sendToBackground } from "../../shared/messages";
import type { HudStatus, HudCommandResult } from "../../shared/messages";
import type { Finding, OrderFinding } from "../../transport/types";
import type { ProductRef } from "../../transport/hud-commands";
import { log } from "../../shared/log";

// Chunk size for the batched Content Butler push, so one huge history does not
// arrive as a single multi-thousand-item command.
const CONTENT_BUTLER_CHUNK = 200;

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
  const section = addSection(t().ordersButler);

  const intro = el("p", "note");
  intro.textContent = t().ordersButlerIntro;
  section.append(intro);

  const scopeRow = el("label", "note");
  scopeRow.textContent = t().scopeLabel;
  const scopeSelect = el("select") as HTMLSelectElement;
  scopeSelect.append(
    new Option(t().scopeNew, "new"),
    new Option(t().scopeAll, "all"),
  );
  scopeRow.append(scopeSelect);
  section.append(scopeRow);

  const button = el("button", "btn");
  button.textContent = t().syncMyOrders;
  const progress = el("p", "progress");
  section.append(button, progress);

  // Re-auth banner: shown when Amazon bounces a page to sign-in mid-walk.
  const authBanner = el("div", "note");
  authBanner.hidden = true;
  const authText = el("span");
  authText.textContent = t().reauthPrompt;
  const resumeBtn = el("button", "btn");
  resumeBtn.textContent = t().resume;
  authBanner.append(authText, resumeBtn);
  section.append(authBanner);

  const resultsList = el("ul", "list");
  section.append(resultsList);

  // Holds the "Send N products to Content Butler" button after a harvest, when
  // the desktop app is connected.
  const actionsRow = el("div", "row");
  section.append(actionsRow);

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
    actionsRow.replaceChildren();
    void runHarvest(scope, marketplace, progress, resultsList, actionsRow, waitForResume, abort.signal)
      .catch((error) => {
        if (!abort?.signal.aborted) log("orders-butler", "harvest failed", error);
      })
      .finally(() => {
        button.disabled = false;
        scopeSelect.disabled = false;
        button.textContent = t().syncAgain;
      });
  });
}

async function runHarvest(
  scope: HarvestScope,
  marketplace: string,
  progress: HTMLElement,
  resultsList: HTMLElement,
  actionsRow: HTMLElement,
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
  // Unique harvested products (deduped by ASIN) for the Content Butler push.
  const products = new Map<string, ProductRef>();

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
      progress.textContent = t().harvestReading(year, Math.floor(startIndex / PAGE_SIZE) + 1, orderCount);

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
        progress.textContent = t().waitingForSignin;
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
          if (item.asin && !products.has(item.asin)) {
            products.set(item.asin, {
              asin: item.asin,
              marketplace,
              title: item.title.slice(0, 200),
              priceCents: item.priceCents,
              currency: "USD",
            });
          }
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
    ? t().harvestStopped(itemCount, orderCount)
    : reachedCursor
      ? t().harvestUpToDate(itemCount, orderCount)
      : orderCount > 0
        ? t().harvestDone(itemCount, orderCount)
        : t().harvestNoOrders;

  // Offer a one-click push of the harvested products into the desktop Content
  // Butler planner, when the app is connected. The dashboard sync above always
  // runs regardless; this is the extra desktop hand-off.
  if (products.size > 0) {
    void renderContentButlerAction(actionsRow, [...products.values()]);
  }
}

async function renderContentButlerAction(actionsRow: HTMLElement, products: ProductRef[]): Promise<void> {
  const hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
  if (!hud.connected) return; // app absent: dashboard sync is the path

  const status = el("p", "note");
  const btn = el("button", "btn secondary");
  btn.textContent = t().obSendToContentButler(products.length);
  btn.addEventListener("click", () => {
    btn.disabled = true;
    status.textContent = t().obSendingToContentButler;
    void pushProductsToContentButler(products).then((result) => {
      btn.disabled = false;
      status.textContent = result.ok
        ? t().obSentToContentButler(result.sent)
        : (result.message ?? t().couldNotReachApp);
    });
  });
  actionsRow.replaceChildren(btn, status);
}

// Push the products in chunks so one huge history is not a single command.
// Stops on the first failed chunk and reports how many made it.
async function pushProductsToContentButler(
  products: ProductRef[],
): Promise<{ ok: boolean; sent: number; message?: string }> {
  let sent = 0;
  for (let i = 0; i < products.length; i += CONTENT_BUTLER_CHUNK) {
    const chunk = products.slice(i, i + CONTENT_BUTLER_CHUNK);
    const r = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "content.push.batch", products: chunk },
    });
    if (!r.ok) return { ok: false, sent, message: r.message };
    sent += chunk.length;
  }
  return { ok: true, sent };
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
    const extra = order.items.length > 1 ? t().plusMore(order.items.length - 1) : "";
    detail.textContent = `${order.orderDate ?? t().dateUnknown}${extra}`;
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
