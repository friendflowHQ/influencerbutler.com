import { readHeaderCount } from "./video-carousel";
import {
  extractBestsellerRank,
  extractBoughtPastMonth,
  extractCategory,
  extractInStock,
} from "./product-signals";

// Signals readable from a product page's *static* server HTML (a credentialed
// same-origin fetch, no JS run). Verified live: the image-block hero-video
// markers, the "Videos for this product" rail container, and the #videoCount
// header are all server-rendered; the influencer/brand/customer classification
// is NOT (it loads via ajax), which is why the store overlay's deep pass still
// goes through the SCAN_ASIN_IN_TAB background-tab scan.

export type DpStaticSignals = {
  // A video slot in the image block (the "upper" carousel per
  // video-carousel.ts carouselSourceFor): the placement a shoppable review
  // video can actually land in.
  upperCarousel: boolean;
  // The "Videos for this product" related rail below the fold.
  lowerCarousel: boolean;
  // The #videoCount header total ("60 Videos"). Null = unknown, never 0.
  totalVideos: number | null;
  category: string | null;
  bestsellerRank: { rank: number; category: string } | null;
  boughtPastMonth: number | null;
  inStock: boolean;
};

// Mirrors carouselSourceFor's upper/lower split, applied to raw HTML.
const UPPER_RE = /heroquickview|detailpage-imageblock-player/i;
const LOWER_RE = /va-related-videos-widget|vse-related-videos|vftphero/i;

// Amazon's automated-access / captcha interstitials. If parsed as product
// pages these read "not available", so callers must bail out instead. Shared
// with the storefront checkup's deep passes (single definition).
export const BLOCKED_RE =
  /validateCaptcha|Enter the characters you see|Type the characters you see|Robot Check|To discuss automated access/i;

// Pure (exported for tests): carousel presence from the raw HTML string.
export function detectCarouselMarkers(html: string): { upper: boolean; lower: boolean } {
  return { upper: UPPER_RE.test(html), lower: LOWER_RE.test(html) };
}

// Pure (exported for tests): is this a robot-check page rather than a product?
export function isBlockedHtml(html: string): boolean {
  return BLOCKED_RE.test(html);
}

// A rendered product page (the title block is server-rendered), used to tell a
// genuine "no videos" page apart from a page that simply did not render.
const PRODUCT_MARKER_RE = /id=["']productTitle["']/i;

// Pure (exported for tests): the #videoCount header total ("60 Videos") read
// straight from raw HTML, for the BACKGROUND worker which has no DOMParser (the
// DOM reader readHeaderCount cannot run there). Amazon renders
// <span id="videoCount" data-video-count="60">60 VIDEOS</span> server-side, so
// both the attribute and the element text are present before hydration.
//
// Returns the count, or 0 when the page clearly rendered as a product yet carries
// no video-count marker and neither video carousel (a genuine "no creator videos
// yet"), or null when the count cannot be trusted (a blocked / unrendered page),
// so a caller can retry instead of caching a false zero.
export function readVideoCountFromHtml(html: string): number | null {
  const attr = html.match(/data-video-count\s*=\s*["'](\d[\d,]*)["']/i);
  if (attr && attr[1]) return toInt(attr[1]);
  const tag = html.match(/id=["']videoCount["'][^>]*>([^<]*)/i);
  if (tag && tag[1]) {
    const digits = tag[1].match(/\d[\d,]*/);
    if (digits) return toInt(digits[0]);
  }
  const { upper, lower } = detectCarouselMarkers(html);
  if (PRODUCT_MARKER_RE.test(html) && !upper && !lower) return 0;
  return null;
}

function toInt(raw: string): number {
  return parseInt(raw.replace(/,/g, ""), 10);
}

export function extractDpStatic(doc: Document, html: string): DpStaticSignals {
  const { upper, lower } = detectCarouselMarkers(html);
  return {
    upperCarousel: upper,
    lowerCarousel: lower,
    totalVideos: readHeaderCount(doc),
    category: extractCategory(doc),
    bestsellerRank: extractBestsellerRank(doc),
    boughtPastMonth: extractBoughtPastMonth(doc),
    inStock: extractInStock(doc),
  };
}
