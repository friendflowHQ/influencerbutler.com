// Storefront (amazon.com/shop/handle) parsing. The storefront is a React SPA
// whose content grid renders each video as a `.video-item-hero-container`
// card (generic fallback `[class*="item-hero-container"]`), with the tagged
// products sitting right inside the card as `[data-csa-c-item-id]` entries
// whose value is `amzn1.asin.<ASIN>`. The card's own id is `...vse.video.<id>`.
// So the whole checkup reads directly off the grid: no per-video fetching.
// Selectors verified against a live storefront and the desktop repo's
// docs/developer/storefront-butler-amazon-dom.md (2026-07-06).

export type StorefrontVideoTile = {
  videoId: string | null;
  title: string | null;
  taggedProducts: number;
};

const ASIN_ITEM_RE = /amzn1\.asin/i;
const VIDEO_ID_RE = /vse\.video\.([A-Za-z0-9-]+)/i;

export function findVideoTiles(doc: Document): StorefrontVideoTile[] {
  let cards = Array.from(doc.querySelectorAll<HTMLElement>(".video-item-hero-container"));
  if (cards.length === 0) {
    // Fallback: the generic hero container, kept only to video cards.
    cards = Array.from(doc.querySelectorAll<HTMLElement>("[class*='item-hero-container']")).filter(
      (c) => /video/i.test(c.className),
    );
  }

  return cards.map((card, index) => {
    const ids = Array.from(card.querySelectorAll("[data-csa-c-item-id]")).map(
      (el) => el.getAttribute("data-csa-c-item-id") ?? "",
    );
    const taggedProducts = ids.filter((v) => ASIN_ITEM_RE.test(v)).length;
    const videoId = extractVideoId(ids.find((v) => VIDEO_ID_RE.test(v)) ?? "");
    return {
      videoId,
      title: videoId ? `Video ${videoId.slice(0, 6)}` : `Video ${index + 1}`,
      taggedProducts,
    };
  });
}

function extractVideoId(itemId: string): string | null {
  const match = itemId.match(VIDEO_ID_RE);
  return match && match[1] ? match[1] : null;
}
