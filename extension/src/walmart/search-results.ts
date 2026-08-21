import type { SearchTile } from "../amazon/search-results";
import { readNextData, pathInto, type NextData } from "./next-data";

// Walmart's search/browse equivalent of amazon/search-results. Returns the SAME
// SearchTile shape so the search overlay consumes it unchanged.
//
// IMPORTANT (verified live 2026-08-21): the search __NEXT_DATA__ is only the SSR
// first paint; the rendered grid is re-fetched/re-ranked client-side, so its
// tiles do NOT match the SSR item set. The money data must therefore be read
// from each rendered tile's own DOM (like the Amazon overlay), NOT from
// __NEXT_DATA__. Anchoring on the price hook is the reliable path (every tile
// has exactly one), then the numeric item id is resolved per tile:
//   [data-automation-id="product-price"]   the tile anchor ("current price $39.99")
//   .closest("[data-item-id]")             the tile container
//   a[link-identifier]                     the numeric item id (data-item-id is
//                                          sometimes Walmart's alphanumeric id)
//   [data-automation-id="product-title"]   title
//   [data-testid="product-reviews"]        review count
// parseWalmartSearchItems (the SSR-JSON reader) is kept for product-grid SSR
// pages where the JSON is authoritative, but the overlay uses the DOM path.

const PRICE_RE = /current price\s*\$?\s*([\d,]+\.\d{2})/i;
const PRICE_FALLBACK_RE = /\$\s?([\d,]+\.\d{2})/;
const RATING_RE = /([\d.]+)\s*out of\s*5/i;

// Pure parsers (exported for tests).
export function parseWalmartPriceCents(text: string): number | null {
  const m = text.match(PRICE_RE) ?? text.match(PRICE_FALLBACK_RE);
  if (!m || !m[1]) return null;
  const value = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function parseWalmartReviewCount(text: string): number | null {
  const digits = (text.match(/[\d,]+/)?.[0] ?? "").replace(/,/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseWalmartRating(text: string): number | null {
  const m = text.match(RATING_RE);
  if (!m || !m[1]) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 5 ? v : null;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

const NUMERIC_ID_RE = /^\d{3,15}$/;
const IP_HREF_ID_RE = /\/ip\/(?:[^/]+\/)?(\d{3,15})/;
const PRICE_SEL = '[data-automation-id="product-price"]';

// The reorderable grid cell for a tile: the ancestor that is a direct child of
// the results grid (its parent holds two or more price-bearing tiles). The
// shared overlay reorders and hides tiles by this element, so it must be a real
// grid sibling, not the inner [data-item-id] node (Walmart wraps each tile in
// its own single-child div). Falls back to the node itself for a lone tile.
function reorderCell(node: HTMLElement): HTMLElement {
  let cur: HTMLElement = node;
  for (let i = 0; i < 6 && cur.parentElement; i++) {
    const parent = cur.parentElement;
    const tileKids = Array.from(parent.children).filter((c) => c.querySelector(PRICE_SEL)).length;
    if (tileKids >= 2) return cur;
    cur = parent;
  }
  return node;
}

// Resolve a tile's numeric Walmart item id. data-item-id is sometimes Walmart's
// alphanumeric GraphQL id, so prefer the anchor's link-identifier, then a
// numeric data-item-id, then the id in an /ip/ href.
function resolveItemId(tile: HTMLElement): string | null {
  const link = tile.querySelector("a[link-identifier]")?.getAttribute("link-identifier") ?? "";
  if (NUMERIC_ID_RE.test(link)) return link;
  const dii = tile.getAttribute("data-item-id") ?? "";
  if (NUMERIC_ID_RE.test(dii)) return dii;
  const href = tile.querySelector('a[href*="/ip/"]')?.getAttribute("href") ?? "";
  const m = href.match(IP_HREF_ID_RE);
  return m?.[1] ?? null;
}

// Read the rendered Walmart product tiles. Anchors on the price hook (one per
// tile), walks up to the tile container, and resolves a numeric item id.
export function parseSearchTiles(root: ParentNode): SearchTile[] {
  const tiles: SearchTile[] = [];
  const seen = new Set<string>();
  for (const priceEl of Array.from(root.querySelectorAll<HTMLElement>(PRICE_SEL))) {
    const tile = priceEl.closest<HTMLElement>("[data-item-id]");
    if (!tile) continue;
    const itemId = resolveItemId(tile);
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    const ratingText =
      tile.querySelector('[data-testid="product-ratings"]')?.getAttribute("aria-label") ??
      textOf(tile.querySelector('[data-testid="product-ratings"]'));
    tiles.push({
      asin: itemId,
      title: textOf(tile.querySelector('[data-automation-id="product-title"]')) || null,
      priceCents: parseWalmartPriceCents(textOf(priceEl)),
      currency: "USD",
      imageUrl: tile.querySelector<HTMLImageElement>("img")?.getAttribute("src") ?? null,
      href: `https://www.walmart.com/ip/${itemId}`,
      sponsored: /sponsored/i.test(tile.textContent ?? ""),
      boughtPastMonth: null,
      rating: parseWalmartRating(ratingText),
      reviewCount: parseWalmartReviewCount(textOf(tile.querySelector('[data-testid="product-reviews"]'))),
      hasCoupon: false,
      // The reorderable grid cell, so the shared overlay can sort/hide it in
      // place without reparenting it out of its wrapper.
      el: reorderCell(tile),
    });
  }
  return tiles;
}

// --- SSR JSON reader (kept for product-grid SSR pages; not the search path) ---

export type WalmartSearchItem = {
  itemId: string;
  title: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  href: string | null;
  sponsored: boolean;
  rating: number | null;
  reviewCount: number | null;
};

function centsOf(price: unknown): number | null {
  return typeof price === "number" && Number.isFinite(price) ? Math.round(price * 100) : null;
}

function absoluteHref(canonicalUrl: unknown): string | null {
  if (typeof canonicalUrl !== "string" || !canonicalUrl) return null;
  try {
    return new URL(canonicalUrl, "https://www.walmart.com").toString();
  } catch {
    return null;
  }
}

// Pure parser: every Product tile in the SSR search itemStacks, keyed by id.
export function parseWalmartSearchItems(nextData: NextData | null): Map<string, WalmartSearchItem> {
  const map = new Map<string, WalmartSearchItem>();
  const stacks = pathInto(nextData, "props.pageProps.initialData.searchResult.itemStacks");
  if (!Array.isArray(stacks)) return map;
  for (const stack of stacks) {
    const items = (stack as { items?: unknown })?.items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const it = raw as Record<string, unknown>;
      if (it?.__typename !== "Product") continue;
      const itemId = typeof it.usItemId === "string" ? it.usItemId : it.usItemId != null ? String(it.usItemId) : "";
      if (!/^\d{3,15}$/.test(itemId) || map.has(itemId)) continue;
      const image = it.imageInfo as { thumbnailUrl?: string } | undefined;
      map.set(itemId, {
        itemId,
        title: typeof it.name === "string" ? it.name : null,
        priceCents: centsOf(it.price),
        currency: "USD",
        imageUrl: typeof image?.thumbnailUrl === "string" ? image.thumbnailUrl : null,
        href: absoluteHref(it.canonicalUrl),
        sponsored: Boolean(it.isSponsoredFlag || it.sponsoredProduct),
        rating: typeof it.averageRating === "number" ? it.averageRating : null,
        reviewCount: typeof it.numberOfReviews === "number" ? it.numberOfReviews : null,
      });
    }
  }
  return map;
}

// Kept exported so next-data helpers are used even when only the DOM path runs.
export { readNextData };
