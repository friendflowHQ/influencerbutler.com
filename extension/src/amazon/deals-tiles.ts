import { query, queryAll, closest } from "./selectors";
import { parsePriceText, type SearchTile } from "./search-results";
import { marketplaceFromUrl } from "./product-signals";
import { getDealsFeed, imageIdFromUrl, type DealsFeedItem } from "./deals-feed";

// Reads the product tiles off the Today's Deals grid (amazon.com/deals*). The
// current grid stamps data-asin on each product-card (and links it to /dp/), so
// the primary path reads ASINs straight off the tiles like search / best-sellers
// / idea-list. Older grids hid the ASIN (cards linked to javascript:void(0) and
// opened an in-page overlay); for those this parser falls back to the MAIN-world
// deals hook's captured feed (src/content/deals-hook.ts -> src/amazon/deals-feed
// .ts), joining each feed record back to its rendered card so the shared search
// overlay can badge it in place.
//
// The feed join key is the product image: Amazon serves the same photo under one
// media id with different size suffixes, so a feed record's image and its tile's
// <img> share that id. Records the feed carried ASIN-only (e.g. from the
// products batch URL), or that fail to image-match, fall back to matching the
// remaining cards in DOM order.
//
// Returns SearchTile[] (the exact shape the search overlay consumes) so the
// deals overlay is just initSearchOverlay driven by a deals RetailerModule.

export function parseDealsTiles(root: ParentNode, url: string): SearchTile[] {
  const marketplace = marketplaceFromUrl(url);
  const grid = query<HTMLElement>(root, "dealsGrid") ?? (root as unknown as HTMLElement);
  if (!grid) return [];

  // Preferred path: the current Today's Deals grid stamps data-asin on every
  // product-card (and links each card to /dp/<ASIN>), so read the ASINs straight
  // off the tiles the way search and best-sellers do. This needs no deals-hook
  // feed, which the redesigned grid no longer drives (its records ship in the
  // server-rendered HTML, not a fetch/XHR the hook can wrap).
  const domTiles = queryAll<HTMLElement>(grid, "dealsTile");
  const direct: SearchTile[] = [];
  const seenDirect = new Set<string>();
  for (const card of domTiles) {
    const tile = tileFromDom(card, marketplace);
    if (tile && !seenDirect.has(tile.asin)) {
      seenDirect.add(tile.asin);
      direct.push(tile);
    }
  }
  if (direct.length > 0) return direct;

  // Fallback for older / ASIN-less deal grids: join the MAIN-world deals-hook
  // feed to the rendered cards by image, then by DOM order.
  const feed = getDealsFeed();
  if (feed.length === 0) return [];

  // Index the grid's images by media id, so a feed record can find its card.
  const imgsById = new Map<string, HTMLImageElement>();
  for (const img of queryImages(grid)) {
    const id = imageIdFromUrl(img.getAttribute("src") ?? img.getAttribute("data-src"));
    if (id && !imgsById.has(id)) imgsById.set(id, img);
  }

  const tiles: SearchTile[] = [];
  const usedCards = new Set<HTMLElement>();
  const seenAsins = new Set<string>();
  const unmatched: DealsFeedItem[] = [];

  // Pass 1: image join.
  for (const item of feed) {
    if (seenAsins.has(item.asin)) continue;
    const id = imageIdFromUrl(item.imageUrl);
    const img = id ? imgsById.get(id) : undefined;
    const card = img ? cardElFor(img, grid) : null;
    if (!card || usedCards.has(card)) {
      unmatched.push(item);
      continue;
    }
    usedCards.add(card);
    seenAsins.add(item.asin);
    tiles.push(tileFor(item, card, marketplace));
  }

  // Pass 2: positional fallback for records that carried no image (or whose
  // image did not match a rendered card), zipping them against the remaining
  // cards in DOM order. Guards on both lists being non-empty so a total-miss
  // does not manufacture wrong pairings.
  if (unmatched.length > 0) {
    const freeCards = domCards(grid).filter((c) => !usedCards.has(c));
    const pairs = Math.min(unmatched.length, freeCards.length);
    for (let i = 0; i < pairs; i += 1) {
      const item = unmatched[i];
      const card = freeCards[i];
      if (!item || !card || seenAsins.has(item.asin)) continue;
      usedCards.add(card);
      seenAsins.add(item.asin);
      tiles.push(tileFor(item, card, marketplace));
    }
  }

  return tiles;
}

// Build a tile straight from a deals card that carries its own data-asin (the
// current grid). Price, title, and image come from the card's own DOM; the
// overlay's money signals are all ASIN-keyed from here.
function tileFromDom(card: HTMLElement, marketplace: string): SearchTile | null {
  const raw = card.getAttribute("data-asin");
  const asin = raw ? raw.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const domPrice = parsePriceText((card.textContent ?? "").replace(/\s+/g, " ").trim());
  const img = queryImages(card)[0] ?? null;
  return {
    asin,
    title: cleanText(img?.getAttribute("alt")) ?? null,
    priceCents: domPrice.priceCents,
    currency: domPrice.currency || "USD",
    imageUrl: img?.getAttribute("src") ?? null,
    href: `https://www.${marketplace}/dp/${asin}`,
    sponsored: false,
    boughtPastMonth: null,
    rating: null,
    reviewCount: null,
    hasCoupon: false,
    el: card,
  };
}

function tileFor(item: DealsFeedItem, card: HTMLElement, marketplace: string): SearchTile {
  const domPrice = parsePriceText((card.textContent ?? "").replace(/\s+/g, " ").trim());
  const img = queryImages(card)[0] ?? null;
  return {
    asin: item.asin,
    title: item.title ?? cleanText(img?.getAttribute("alt")) ?? null,
    priceCents: item.priceCents ?? domPrice.priceCents,
    currency: item.currency || domPrice.currency,
    imageUrl: item.imageUrl ?? img?.getAttribute("src") ?? null,
    // The card has no product link, so construct the canonical /dp/ URL.
    href: `https://www.${marketplace}/dp/${item.asin}`,
    sponsored: false,
    boughtPastMonth: null,
    rating: null,
    reviewCount: null,
    hasCoupon: false,
    el: card,
  };
}

// The card element to badge for a tile image: the nearest deals-tile ancestor
// when one matches, else climb toward (but not into) the grid so the badge
// mounts on a card-level container rather than the bare <img>.
function cardElFor(img: HTMLElement, grid: HTMLElement): HTMLElement {
  const explicit = closest<HTMLElement>(img, "dealsTile");
  if (explicit && grid.contains(explicit) && explicit !== grid) return explicit;
  let best: HTMLElement = img.parentElement ?? img;
  for (let i = 0; i < 5; i += 1) {
    const parent = best.parentElement;
    if (!parent || parent === grid || !grid.contains(parent)) break;
    best = parent;
  }
  return best;
}

// Rendered cards in DOM order, for the positional fallback. Prefers the
// deals-tile selector; when it does not match (layout drift), derives one card
// per grid image by climbing to its card container.
function domCards(grid: HTMLElement): HTMLElement[] {
  const explicit = queryAll<HTMLElement>(grid, "dealsTile");
  if (explicit.length > 0) return explicit;
  const cards: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const img of queryImages(grid)) {
    const card = cardElFor(img, grid);
    if (!seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  }
  return cards;
}

function queryImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img"));
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
