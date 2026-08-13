// Fast storefront harvest via Amazon's own getItems endpoint. This is the
// same load-more call the storefront fires on scroll, so we page through it
// directly: HTML fragments, no rendering, no images, all content in a few
// requests. viewScope=Mixed returns every content type (video, photo, idea
// list, media list) in one paginated feed. Mechanics mirror the desktop
// repo's storefront-butler-scraper.js (verified live 2026-07-06).

import {
  STOREFRONT_CARD_SELECTOR,
  cardContentType,
  cardTaggedAsins,
  type StorefrontContentType,
} from "../../amazon/storefront-cards";

// Re-exported so existing importers keep the local name; the definition and the
// card-reading helpers now live in amazon/storefront-cards.ts (shared with the
// live-DOM earnings overlay).
export type ContentType = StorefrontContentType;

export type HarvestedItem = {
  type: ContentType;
  title: string;
  url: string;
  // Tagged product ASINs. Complete for videos (from the card JSON); photos and
  // lists only expose a detail link in the feed, so their products need a
  // deeper pass and are left empty here.
  taggedAsins: string[];
  productsKnown: boolean;
};

// Why pagination ended. "end-of-feed" and "page-cap" are normal completions;
// everything else means the scan stopped before the feed ran out and the
// results may be incomplete, which the panel surfaces.
export type HarvestStopReason =
  | "end-of-feed"
  | "page-cap"
  | "http-error"
  | "empty-page"
  | "token-echo";

export type HarvestResult = {
  counts: Record<ContentType, number>;
  items: HarvestedItem[];
  pages: number;
  capped: boolean;
  stopReason: HarvestStopReason;
  // Feed cards that matched the card selector but none of the known content
  // types. Non-zero usually means Amazon shipped a new card variant.
  droppedCards: number;
  // The storefront page's own "Search all N posts" count, when readable from
  // the live DOM. Null off the /shop/ page or when the markup changed.
  reportedPostCount: number | null;
};

const MAX_PAGES = 500; // ~10k items/feed safety valve, matches the desktop runner
const PAGE_DELAY_MS = 130;

function creatorFromPath(): string | null {
  const m = location.pathname.match(/\/shop\/([^/?#]+)/);
  return m && m[1] ? m[1] : null;
}

// Best-effort read of the storefront's own post count from the live page (the
// "Search all 3,505 posts" search box), so the panel can compare it against
// what the feed actually returned. Only meaningful when the current tab IS the
// creator's storefront; harvests driven by creatorOverride from another page
// return null.
function reportedPostCountFromPage(creator: string): number | null {
  if (creatorFromPath() !== creator) return null;
  const inputs = document.querySelectorAll<HTMLInputElement>("input[placeholder]");
  for (const input of Array.from(inputs)) {
    const m = (input.placeholder || "").match(
      /([\d][\d., \s]*)\s*(posts?|publicaciones|publications)/i,
    );
    if (m && m[1]) {
      const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function parseCard(card: Element, origin: string): HarvestedItem | null {
  const type = cardContentType(card);
  if (!type) return null;

  if (type === "video") {
    const actionEl = card.querySelector("[data-video-item-click]");
    let title = "Video";
    let url = "";
    if (actionEl) {
      try {
        const data = JSON.parse(actionEl.getAttribute("data-video-item-click") || "{}");
        const p = (data.lightboxParams || data) as { title?: string; contentId?: string };
        if (p.title) title = decodeEntities(p.title).slice(0, 120);
        if (p.contentId) url = `${origin}/vdp/${String(p.contentId).trim()}`;
      } catch {
        // fall through to an untagged video record
      }
    }
    return { type, title, url, taggedAsins: cardTaggedAsins(card), productsKnown: true };
  }

  // Photo / idea-list / media-list: the feed gives a detail link only.
  const link =
    card.querySelector("a[href*='/photo/'], a.list-link-container, a[href*='/list/']") ??
    card.querySelector("a[href]");
  const href = link?.getAttribute("href") ?? "";
  return {
    type,
    title: link?.textContent?.trim().slice(0, 120) || labelFor(type),
    url: href ? new URL(href, origin).toString() : "",
    taggedAsins: [],
    productsKnown: false,
  };
}

export async function harvestStorefront(
  onProgress: (pages: number, items: number) => void,
  creatorOverride?: string,
): Promise<HarvestResult> {
  // creatorOverride lets callers off the /shop/ page (e.g. the Creator Hub
  // upload helper) harvest a known handle's feed; same-origin so it still works.
  const creator = creatorOverride ?? creatorFromPath();
  const origin = location.origin;
  const counts: Record<ContentType, number> = {
    video: 0,
    photo: 0,
    "idea-list": 0,
    "media-list": 0,
  };
  const items: HarvestedItem[] = [];
  if (!creator) {
    return {
      counts,
      items,
      pages: 0,
      capped: false,
      stopReason: "end-of-feed",
      droppedCards: 0,
      reportedPostCount: null,
    };
  }

  const reportedPostCount = reportedPostCountFromPage(creator);
  let pageToken = "";
  let pages = 0;
  let capped = false;
  let droppedCards = 0;
  let stopReason: HarvestStopReason = "end-of-feed";

  for (;;) {
    if (pages >= MAX_PAGES) {
      capped = true;
      stopReason = "page-cap";
      break;
    }
    const query = ["viewScope=Mixed", pageToken ? `pageToken=${encodeURIComponent(pageToken)}` : ""]
      .filter(Boolean)
      .join("&");
    const url = `${origin}/shop/${encodeURIComponent(creator)}/getItems?${query}`;

    let html: string;
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { accept: "text/html,*/*", "x-requested-with": "XMLHttpRequest" },
      });
      if (!res.ok) {
        stopReason = "http-error";
        break;
      }
      html = await res.text();
    } catch {
      stopReason = "http-error";
      break;
    }
    if (!html || html.length < 50) {
      stopReason = "empty-page";
      break;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const card of Array.from(doc.querySelectorAll(STOREFRONT_CARD_SELECTOR))) {
      const item = parseCard(card, origin);
      if (!item) {
        droppedCards += 1;
        continue;
      }
      counts[item.type] += 1;
      items.push(item);
    }
    pages += 1;
    onProgress(pages, items.length);

    const nextToken =
      doc.querySelector<HTMLInputElement>("input.pageToken, input[name='pageToken']")?.value ?? "";
    const shouldMore =
      doc.querySelector<HTMLInputElement>("input[name='shouldLoadMoreFlag']")?.value !== "false";
    if (!nextToken || !shouldMore) {
      stopReason = "end-of-feed";
      break;
    }
    if (nextToken === pageToken) {
      stopReason = "token-echo";
      break;
    }
    pageToken = nextToken;
    await sleep(PAGE_DELAY_MS);
  }

  return { counts, items, pages, capped, stopReason, droppedCards, reportedPostCount };
}

function labelFor(type: ContentType): string {
  return type === "photo" ? "Photo" : type === "idea-list" ? "Idea list" : "Media list";
}

function decodeEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
