// Reads the product tiles a creator already has on screen on a walmart.com deal
// page (/shop/deals/black-friday, /shop/deals/cyber-monday, ...) into the
// product list the "Send these deals to Influencer Butler" button sends to the
// desktop app's Black Friday Deals table (walmartEvent.capture).
//
// Why the page and not a fetch: Walmart puts a "press and hold" human check in
// front of automated browsers on these pages. The creator's own Chrome is a
// normal shopper, so we only ever read the page they are looking at, when they
// click. Never fetch Walmart pages in the background from here.
//
// The DOM walk is written against a tiny structural subset of the DOM
// (TileElement) so the unit tests can feed it a hand-built fixture: vitest runs
// in the node environment with no jsdom in this repo.

export const WALMART_DEAL_CAPTURE_MAX = 500;
export const WALMART_DEAL_CAPTURE_CHUNK = 200;

export type WalmartEventProduct = {
  itemId: string;
  title: string;
  url: string;
  imageUrl?: string;
  nowPrice?: number;
  wasPrice?: number;
  badge?: string;
  shippingText?: string;
};

export type WalmartTilePricing = { nowPrice?: number; wasPrice?: number; badge?: string };

// The minimum of a DOM node the walk reads. A real Element satisfies it.
export interface TileNode {
  nodeType: number;
  nodeValue: string | null;
  childNodes: ArrayLike<TileNode>;
}
export interface TileElement extends TileNode {
  tagName: string;
  parentElement: TileElement | null;
  getAttribute(name: string): string | null;
}

// A walmart.com deal page: /shop/deals itself or anything under it.
export function isWalmartDealsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "walmart.com" && host !== "www.walmart.com") return false;
  return /^\/shop\/deals(?:\/|$)/i.test(parsed.pathname);
}

// The Walmart item id of a product link: the trailing digit run of the /ip/
// path (https://www.walmart.com/ip/Some-Name/17701403764 -> "17701403764").
// Null for anything that is not a walmart.com /ip/ link.
export function walmartItemIdFromHref(href: string | null | undefined, base = "https://www.walmart.com/"): string | null {
  if (!href) return null;
  let parsed: URL;
  try {
    parsed = new URL(href, base);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "walmart.com" && !host.endsWith(".walmart.com")) return null;
  const path = parsed.pathname;
  if (!/^\/ip\//i.test(path)) return null;
  const m = /\/(\d{3,15})\/?$/.exec(path);
  return m && m[1] ? m[1] : null;
}

// Port of the desktop's parseWalmartTilePricing. Keep the two identical so a
// tile reads the same price and badge on both sides.
export function parseWalmartTilePricing(text: string | null | undefined): WalmartTilePricing {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!t) return {};
  const money = (s: string | undefined): number | null => {
    const n = Number(String(s || "").replace(/[$,]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const nowM =
    /\bNow \$\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t) || /current price (?:Now )?\$\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  const wasM = /\bWas \$\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  const out: WalmartTilePricing = {};
  const now = nowM ? money(nowM[1]) : null;
  const was = wasM ? money(wasM[1]) : null;
  if (now != null) out.nowPrice = now;
  if (was != null) out.wasPrice = was;
  if (/walmart plus early access|walmart\+ early access|\bearly access\b/i.test(t)) out.badge = "Walmart+ Early Access";
  else if (/\bblack friday deal\b/i.test(t)) out.badge = "Black Friday Deal";
  else if (/\bcyber monday deal\b/i.test(t)) out.badge = "Cyber Monday Deal";
  else if (/\bflash deal\b/i.test(t)) out.badge = "Flash Deal";
  else if (/\brollback\b/i.test(t)) out.badge = "Rollback";
  return out;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);
// How far above the link the walk looks for the product card.
const MAX_CLIMB = 8;
const SHIPPING_RE = /\b(?:shipping|delivery|pickup|arrives)\b/i;
const MAX_SHIPPING_LEN = 120;

function isElement(node: TileNode): node is TileElement {
  return node.nodeType === 1;
}

// innerText-like: text nodes joined with spaces, so "Now $199.00" and
// "Was $299.00" in sibling spans never fuse into "$199.00Was" (which would
// defeat the parser's \b anchors). textContent alone would do exactly that.
export function tileText(el: TileElement): string {
  const parts: string[] = [];
  const walk = (node: TileNode): void => {
    if (node.nodeType === 3) {
      const v = node.nodeValue;
      if (v && v.trim()) parts.push(v);
      return;
    }
    if (!isElement(node)) return;
    if (SKIP_TAGS.has(node.tagName.toUpperCase())) return;
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child) walk(child);
    }
  };
  walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function* elementsUnder(el: TileElement): Generator<TileElement> {
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (!child || !isElement(child)) continue;
    if (SKIP_TAGS.has(child.tagName.toUpperCase())) continue;
    yield child;
    yield* elementsUnder(child);
  }
}

function isTag(el: TileElement, tag: string): boolean {
  return el.tagName.toUpperCase() === tag;
}

// True when `el` (or anything under it) links to a Walmart item other than
// `itemId`. Exits on the first foreign id, so a grid-sized ancestor costs only
// as far as the neighbouring tile.
function linksToOtherItem(el: TileElement, itemId: string, base: string): boolean {
  const check = (node: TileElement): boolean => {
    if (!isTag(node, "A")) return false;
    const id = walmartItemIdFromHref(node.getAttribute("href"), base);
    return id !== null && id !== itemId;
  };
  if (check(el)) return true;
  for (const node of elementsUnder(el)) if (check(node)) return true;
  return false;
}

// The product card around a tile link: the highest ancestor (within a few
// levels) that still links to no other item. Walmart marks its tile container
// with data-item-id, so the climb stops there when it reaches one.
export function findTileCard(anchor: TileElement, itemId: string, base = "https://www.walmart.com/"): TileElement {
  let card: TileElement = anchor;
  let node = anchor.parentElement;
  for (let i = 0; node && i < MAX_CLIMB; i++, node = node.parentElement) {
    if (isTag(node, "BODY") || isTag(node, "HTML")) break;
    if (linksToOtherItem(node, itemId, base)) break;
    card = node;
    if (node.getAttribute("data-item-id") !== null) break;
  }
  return card;
}

function httpsUrl(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim();
  return /^https:\/\//i.test(v) ? v : undefined;
}

function firstSrcsetUrl(srcset: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first || null;
}

// The deepest element whose text reads like a shipping / delivery line.
function findShippingText(card: TileElement): string | undefined {
  const badge = [...elementsUnder(card)].find(
    (el) => el.getAttribute("data-automation-id") === "fulfillment-badge",
  );
  if (badge) {
    const text = tileText(badge);
    if (text && text.length <= MAX_SHIPPING_LEN) return text;
  }
  const descend = (el: TileElement): string | undefined => {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (!child || !isElement(child) || SKIP_TAGS.has(child.tagName.toUpperCase())) continue;
      const text = tileText(child);
      if (!SHIPPING_RE.test(text)) continue;
      const deeper = descend(child);
      if (deeper) return deeper;
      if (text.length <= MAX_SHIPPING_LEN) return text;
    }
    return undefined;
  };
  return descend(card);
}

// One tile link -> the product it shows. Null when the link is not a /ip/ item
// or the tile has no readable title.
export function readTileProduct(anchor: TileElement, base = "https://www.walmart.com/"): WalmartEventProduct | null {
  const itemId = walmartItemIdFromHref(anchor.getAttribute("href"), base);
  if (!itemId) return null;
  const card = findTileCard(anchor, itemId, base);
  const inCard = [...elementsUnder(card)];

  const titleHook = inCard.find((el) => el.getAttribute("data-automation-id") === "product-title");
  const img = isTag(card, "IMG") ? card : inCard.find((el) => isTag(el, "IMG"));
  // A link that wraps the whole tile carries the price line too, so its text is
  // only a title when it holds no price.
  const anchorText = tileText(anchor);
  const title =
    (titleHook ? tileText(titleHook) : "") ||
    (anchorText && !anchorText.includes("$") ? anchorText : "") ||
    (anchor.getAttribute("aria-label") ?? "").trim() ||
    (img?.getAttribute("alt") ?? "").trim();
  if (!title) return null;

  const product: WalmartEventProduct = {
    itemId,
    title: title.slice(0, 300),
    url: `https://www.walmart.com/ip/${itemId}`,
  };
  const imageUrl = httpsUrl(img?.getAttribute("src")) ?? httpsUrl(firstSrcsetUrl(img?.getAttribute("srcset") ?? null));
  if (imageUrl) product.imageUrl = imageUrl;
  Object.assign(product, parseWalmartTilePricing(tileText(card)));
  const shippingText = findShippingText(card);
  if (shippingText) product.shippingText = shippingText;
  return product;
}

// Every product link on the page -> one product per item id, first seen wins
// (later links to the same item only fill in what the first lacked), capped.
export function collectWalmartDeals(
  anchors: Iterable<TileElement>,
  options: { base?: string; max?: number } = {},
): { products: WalmartEventProduct[]; capped: boolean } {
  const base = options.base ?? "https://www.walmart.com/";
  const max = options.max ?? WALMART_DEAL_CAPTURE_MAX;
  const byId = new Map<string, WalmartEventProduct>();
  let capped = false;
  for (const anchor of anchors) {
    const itemId = walmartItemIdFromHref(anchor.getAttribute("href"), base);
    if (!itemId) continue;
    const seen = byId.get(itemId);
    if (!seen && byId.size >= max) {
      capped = true;
      continue;
    }
    if (seen && seen.imageUrl && seen.nowPrice != null && seen.badge && seen.shippingText) continue;
    const product = readTileProduct(anchor, base);
    if (!product) continue;
    if (!seen) {
      byId.set(itemId, product);
      continue;
    }
    for (const key of ["imageUrl", "nowPrice", "wasPrice", "badge", "shippingText"] as const) {
      if (seen[key] === undefined && product[key] !== undefined) {
        (seen as Record<string, unknown>)[key] = product[key];
      }
    }
  }
  return { products: [...byId.values()], capped };
}
