// Fast storefront harvest via Amazon's own getItems endpoint. This is the
// same load-more call the storefront fires on scroll, so we page through it
// directly: HTML fragments, no rendering, no images, all content in a few
// requests. viewScope=Mixed returns every content type (video, photo, idea
// list, media list) in one paginated feed. Mechanics mirror the desktop
// repo's storefront-butler-scraper.js (verified live 2026-07-06).

export type ContentType = "video" | "photo" | "idea-list" | "media-list";

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

export type HarvestResult = {
  counts: Record<ContentType, number>;
  items: HarvestedItem[];
  pages: number;
  capped: boolean;
};

const MAX_PAGES = 500; // ~10k items/feed safety valve, matches the desktop runner
const PAGE_DELAY_MS = 130;
const ASIN_RE = /^[A-Z0-9]{10}$/;

const CARD_SELECTOR = "[class*='item-hero-container']";

function typeOf(card: Element): ContentType | null {
  const c = card.className || "";
  if (/video-item-hero-container/.test(c)) return "video";
  if (/photo-item-hero-container/.test(c)) return "photo";
  if (/list-item-hero-container/.test(c)) return "idea-list";
  if (/media-list-container/.test(c)) return "media-list";
  return null;
}

function creatorFromPath(): string | null {
  const m = location.pathname.match(/\/shop\/([^/?#]+)/);
  return m && m[1] ? m[1] : null;
}

function parseCard(card: Element, origin: string): HarvestedItem | null {
  const type = typeOf(card);
  if (!type) return null;

  if (type === "video") {
    const actionEl = card.querySelector("[data-video-item-click]");
    let title = "Video";
    let url = "";
    const tagged = new Set<string>();
    if (actionEl) {
      try {
        const data = JSON.parse(actionEl.getAttribute("data-video-item-click") || "{}");
        const p = (data.lightboxParams || data) as {
          title?: string;
          contentId?: string;
          productAsin?: string;
          relatedProducts?: string;
        };
        if (p.title) title = decodeEntities(p.title).slice(0, 120);
        if (p.contentId) url = `${origin}/vdp/${String(p.contentId).trim()}`;
        for (const raw of [p.productAsin, ...String(p.relatedProducts || "").split(",")]) {
          const asin = String(raw || "").trim().toUpperCase();
          if (ASIN_RE.test(asin)) tagged.add(asin);
        }
      } catch {
        // fall through to an untagged video record
      }
    }
    return { type, title, url, taggedAsins: [...tagged], productsKnown: true };
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
  if (!creator) return { counts, items, pages: 0, capped: false };

  let pageToken = "";
  let pages = 0;
  let capped = false;

  for (;;) {
    if (pages >= MAX_PAGES) {
      capped = true;
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
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }
    if (!html || html.length < 50) break;

    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const card of Array.from(doc.querySelectorAll(CARD_SELECTOR))) {
      const item = parseCard(card, origin);
      if (!item) continue;
      counts[item.type] += 1;
      items.push(item);
    }
    pages += 1;
    onProgress(pages, items.length);

    const nextToken =
      doc.querySelector<HTMLInputElement>("input.pageToken, input[name='pageToken']")?.value ?? "";
    const shouldMore =
      doc.querySelector<HTMLInputElement>("input[name='shouldLoadMoreFlag']")?.value !== "false";
    if (!nextToken || nextToken === pageToken || !shouldMore) break;
    pageToken = nextToken;
    await sleep(PAGE_DELAY_MS);
  }

  return { counts, items, pages, capped };
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
