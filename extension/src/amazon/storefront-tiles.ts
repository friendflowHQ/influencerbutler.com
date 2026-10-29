import {
  STOREFRONT_CARD_SELECTOR,
  cardContentType,
  cardTaggedAsins,
  type StorefrontContentType,
} from "./storefront-cards";

// One visible storefront/Curations card in the live DOM, with the product ASINs
// it tags. The earnings overlay badges each of these with what the creator has
// earned across its products. Cards with no readable ASINs are skipped by the
// parser (nothing to badge), which also drops photo/idea-list cards whose
// products only load behind a detail link.
export type StorefrontTile = {
  el: HTMLElement;
  contentType: StorefrontContentType;
  taggedAsins: string[];
};

// A "Trending picks" carousel tile: one product, tagged by the ASIN Amazon puts
// on the slide (data-asin="amzn1.asin.<ASIN>"). Not a content card, so it is not
// a StorefrontTile and the earnings overlay never sees it.
export type TrendingTile = { el: HTMLElement; taggedAsins: string[] };

const TRENDING_TILE_SELECTOR = "li.trending-asin-carousel-element-container[data-asin]";

export function parseTrendingTiles(doc: Document | Element): TrendingTile[] {
  const tiles: TrendingTile[] = [];
  for (const li of Array.from(doc.querySelectorAll<HTMLElement>(TRENDING_TILE_SELECTOR))) {
    const asin = (li.getAttribute("data-asin") ?? "").replace(/^amzn1\.asin\./i, "").toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) tiles.push({ el: li, taggedAsins: [asin] });
  }
  return tiles;
}

// Read the storefront grid straight from the rendered DOM (as opposed to the
// getItems fetch the checkup harvester uses), so the overlay can badge the cards
// the user is actually looking at and re-badge as the SPA loads more.
export function parseStorefrontTiles(doc: Document | Element): StorefrontTile[] {
  const tiles: StorefrontTile[] = [];
  for (const card of Array.from(doc.querySelectorAll(STOREFRONT_CARD_SELECTOR))) {
    const contentType = cardContentType(card);
    if (!contentType) continue;
    const taggedAsins = cardTaggedAsins(card);
    if (taggedAsins.length === 0) continue;
    tiles.push({ el: card as HTMLElement, contentType, taggedAsins });
  }
  return tiles;
}
