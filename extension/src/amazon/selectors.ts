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
  | "storefrontTile"
  | "mainImage"
  | "breadcrumbs"
  | "siteStripeCommission";

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
  // :not(.a-text-price) skips the struck-through list price; queryMatchingText
  // then skips empty decoy containers. Together they land on the current
  // "price to pay" across buybox layouts.
  price: [
    ".priceToPay .a-offscreen",
    ".reinventPricePriceToPayMargin .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
    "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",
    "#apex_desktop .a-price:not(.a-text-price) .a-offscreen",
    ".a-price:not(.a-text-price) .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
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
  mainImage: [
    "#landingImage",
    "#imgTagWrapperId img",
    "#main-image-container img",
  ],
  // The category breadcrumb trail above the title. The last crumb is the
  // narrowest category, which we match against the Associates rate card.
  breadcrumbs: [
    "#wayfinding-breadcrumbs_feature_div",
    "#wayfinding-breadcrumbs_container",
  ],
  // The SiteStripe "Influencers & Associates" bar shows the live commission
  // rate for logged-in creators. Amazon labels it "Commission rate" with the
  // percent in a sibling; we read the whole bar text and regex the percent.
  siteStripeCommission: [
    "#amzn-ss-text-shrink-link",
    "#amzn-ss-wrap",
    "#amzn-ss-tracking-id-display",
    "[id^='amzn-ss']",
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

// Returns the trimmed text of the first element (across ALL selectors and all
// their matches) whose text passes `test`. Unlike query(), it does not stop at
// the first matching element: Amazon often has an empty decoy match before the
// real one (e.g. a price container holding only a <style> block), so callers
// that need actual content must keep looking.
export function queryMatchingText(
  doc: ParentNode,
  id: SelectorId,
  test: (text: string) => boolean,
): string | null {
  for (const sel of REGISTRY[id]) {
    try {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text && test(text)) return text;
      }
    } catch {
      // skip an invalid selector strategy
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
