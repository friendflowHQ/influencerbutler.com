// THE selector registry. Every Amazon selector in the extension lives here
// as an ordered fallback list, so when Amazon shuffles its DOM there is one
// file to update and local telemetry shows which ids started missing.

export type SelectorId =
  | "videoWidget"
  | "videoCards"
  | "videoCardCreatorLink"
  | "videoCardByline"
  | "videoHeaderCount"
  | "productTitle"
  | "productByline"
  | "price"
  | "availability"
  | "addToCart"
  | "boughtPastMonth"
  | "asinInput"
  | "orderCard"
  | "orderDate"
  | "storefrontTile";

const REGISTRY: Record<SelectorId, string[]> = {
  // "Videos for this product" widget containers, newest layout first.
  videoWidget: [
    "#va-related-videos-widget_feature_div",
    "#vse-related-videos_feature_div",
    "[data-csa-c-content-id='vse-related-videos']",
    "[cel_widget_id*='videos-for-this-product']",
  ],
  videoCards: [
    // 2026 vse-hero layout: hashed CSS-module classes, match on the stable
    // fragment. The profile row carries the creator link, so it classifies
    // best; the widget only renders the current video's row, and the
    // #videoCount header top-up reports the rest as unclassified. Older
    // carousel layouts kept as fallbacks.
    "[class*='vseProfileContent']",
    "[class*='vseHeroThumbnail']",
    "li.a-carousel-card [data-video-url]",
    "li.a-carousel-card [data-vdp-url]",
    "li.a-carousel-card",
  ],
  videoCardCreatorLink: [
    "a[href*='/shop/']",
    "a[href*='/vdp/contributor/']",
  ],
  videoCardByline: [
    "[class*='vseProfileName']",
    ".vse-video-byline",
    "[class*='byline']",
    ".a-size-small.a-color-secondary",
  ],
  videoHeaderCount: [
    "#videoCount",
    "[data-video-count]",
  ],
  productTitle: ["#productTitle", "#title"],
  productByline: ["#bylineInfo"],
  price: [
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    ".a-price .a-offscreen",
    "#priceblock_ourprice",
  ],
  availability: ["#availability", "#availabilityInsideBuyBox_feature_div"],
  addToCart: ["#add-to-cart-button"],
  boughtPastMonth: [
    "#socialProofingAsinFaceout_feature_div",
    "#social-proofing-faceout-title-tk_bought",
    "[id*='social-proofing']",
  ],
  asinInput: ["input#ASIN", "input[name='ASIN']"],
  orderCard: [
    ".order-card",
    ".js-order-card",
    "[class*='order-card']",
  ],
  orderDate: [
    ".order-header .a-column .a-size-base",
    ".a-box-group .order-info .value",
  ],
  storefrontTile: [
    "a[href*='/vdp/']",
    "[data-testid*='video'] a",
  ],
};

type Miss = { id: string; count: number };
const misses = new Map<string, number>();

export function query<T extends Element = HTMLElement>(
  doc: ParentNode,
  id: SelectorId,
): T | null {
  for (const sel of REGISTRY[id]) {
    try {
      const found = doc.querySelector<Element>(sel);
      if (found) return found as T;
    } catch {
      // an invalid selector in one strategy must not kill the rest
    }
  }
  recordMiss(id);
  return null;
}

export function queryAll<T extends Element = HTMLElement>(
  doc: ParentNode,
  id: SelectorId,
): T[] {
  for (const sel of REGISTRY[id]) {
    try {
      const found = doc.querySelectorAll<Element>(sel);
      if (found.length > 0) return Array.from(found) as T[];
    } catch {
      // continue to next strategy
    }
  }
  recordMiss(id);
  return [];
}

function recordMiss(id: string): void {
  misses.set(id, (misses.get(id) ?? 0) + 1);
}

export function drainSelectorMisses(): Miss[] {
  const out = Array.from(misses, ([id, count]) => ({ id, count }));
  misses.clear();
  return out;
}
