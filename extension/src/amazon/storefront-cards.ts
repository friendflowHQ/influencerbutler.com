// Shared reading of Amazon storefront/Curations cards. Both the fast getItems
// harvest (storefront-check/harvest.ts) and the live-DOM earnings overlay
// (tools/earnings-overlay) key off the same card markup, so the content-type
// detection, card selector, and tagged-ASIN extraction live here once. Mechanics
// mirror the storefront feed verified live 2026-07-06 (item-hero-container cards
// with a data-video-item-click JSON blob on video cards).

export type StorefrontContentType = "video" | "photo" | "idea-list" | "media-list";

// Cards in the storefront feed. media-list uses its own container class, so the
// selector matches both the *-item-hero-container family and media-list-container.
export const STOREFRONT_CARD_SELECTOR =
  "[class*='item-hero-container'], [class*='media-list-container']";

const ASIN_RE = /^[A-Z0-9]{10}$/;
const ASIN_HREF_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/g;

export function cardContentType(card: Element): StorefrontContentType | null {
  const c = card.className || "";
  if (/video-item-hero-container/.test(c)) return "video";
  if (/photo-item-hero-container/.test(c)) return "photo";
  if (/list-item-hero-container/.test(c)) return "idea-list";
  if (/media-list-container/.test(c)) return "media-list";
  return null;
}

// Tagged product ASINs for a card. Complete for videos (from the card's
// data-video-item-click JSON: productAsin + relatedProducts). Photos and lists
// only expose a detail link in the feed, so their tagged products need a deeper
// pass and usually come back empty here, plus any /dp/ or /gp/product/ links the
// card happens to render.
export function cardTaggedAsins(card: Element): string[] {
  const found = new Set<string>();

  const actionEl = card.querySelector("[data-video-item-click]");
  if (actionEl) {
    try {
      const data = JSON.parse(actionEl.getAttribute("data-video-item-click") || "{}");
      const p = (data.lightboxParams || data) as {
        productAsin?: string;
        relatedProducts?: string;
      };
      for (const raw of [p.productAsin, ...String(p.relatedProducts || "").split(",")]) {
        const asin = String(raw || "").trim().toUpperCase();
        if (ASIN_RE.test(asin)) found.add(asin);
      }
    } catch {
      // fall through to the href scan below
    }
  }

  for (const anchor of Array.from(card.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") || "";
    ASIN_HREF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ASIN_HREF_RE.exec(href))) {
      const asin = (match[1] ?? "").toUpperCase();
      if (ASIN_RE.test(asin)) found.add(asin);
    }
  }

  return [...found];
}
