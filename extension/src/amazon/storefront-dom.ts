import { queryAll } from "./selectors";

// Storefront (amazon.com/shop/handle) parsing. The storefront is a React SPA;
// tiles are found structurally by their video-detail hrefs, which survive
// class-name churn far better than CSS classes.

export type StorefrontVideoTile = {
  url: string;
  videoId: string | null;
  title: string | null;
};

export type VideoDetailInfo = {
  taggedProducts: number;
  unavailableProducts: number;
  productTitles: string[];
};

export function findVideoTiles(doc: Document): StorefrontVideoTile[] {
  const seen = new Set<string>();
  const tiles: StorefrontVideoTile[] = [];
  const anchors = new Set<HTMLAnchorElement>([
    ...queryAll<HTMLAnchorElement>(doc, "storefrontTile"),
    ...Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href*='video']")).filter((a) =>
      /\/(vdp|video)\//.test(a.getAttribute("href") ?? ""),
    ),
  ]);
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const url = new URL(href, doc.baseURI ?? "https://www.amazon.com").toString();
    if (seen.has(url)) continue;
    seen.add(url);
    tiles.push({
      url,
      videoId: extractVideoId(url),
      title: anchor.getAttribute("aria-label") ?? (anchor.textContent?.trim() || null),
    });
  }
  return tiles;
}

function extractVideoId(url: string): string | null {
  const match = url.match(/\/vdp\/([a-z0-9]+)/i) ?? url.match(/video\/([a-z0-9-]+)/i);
  return match && match[1] ? match[1] : null;
}

// Parses a fetched video detail page for its tagged products and their
// availability. Selector-light on purpose: product links are identified by
// /dp/ hrefs, unavailability by adjacent text.
export function parseVideoDetail(doc: Document): VideoDetailInfo {
  const productCards = new Map<string, Element>();
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href*='/dp/']"))) {
    const asinMatch = (anchor.getAttribute("href") ?? "").match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch || !asinMatch[1]) continue;
    const card = anchor.closest("li, [class*='product'], [data-asin]") ?? anchor;
    if (!productCards.has(asinMatch[1])) productCards.set(asinMatch[1], card);
  }

  let unavailable = 0;
  const titles: string[] = [];
  for (const [, card] of productCards) {
    const text = (card.textContent ?? "").replace(/\s+/g, " ");
    if (/currently unavailable|out of stock/i.test(text)) unavailable += 1;
    const title = text.trim().slice(0, 80);
    if (title) titles.push(title);
  }

  return {
    taggedProducts: productCards.size,
    unavailableProducts: unavailable,
    productTitles: titles,
  };
}
