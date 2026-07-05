import { query, queryAll } from "./selectors";
import type { VideoCounts } from "../transport/types";

// Extracts and classifies the "Product Videos" widget. Amazon mixes brand,
// influencer, and customer-review videos; the counts are the product's whole
// competitive picture for an influencer.
//
// Verified against live amazon.com product pages on 2026-07-04:
//  - After the widget scrolls into view, its state lands in
//    script[data-a-state] tags (key "vftphero-related-products-request-ps"
//    for related videos, "detailpage-imageblock-player-*" for the brand
//    video), each video carrying "creatorType" ("Influencer" / "Vendor"),
//    "title", and "publicName". Different scripts hold DIFFERENT video sets,
//    so we aggregate across all of them and dedupe exact duplicate payloads
//    by fingerprint.
//  - None of that exists before the widget is on screen, and none of it is
//    in statically fetched HTML. The one signal always present at load is
//    #videoCount ("18 VIDEOS") in the image block, which we use as the
//    total (strategy "header") until the breakdown hydrates.
//
// Strategy layers, most reliable first:
//  1. State-script JSON aggregated across all creatorType-bearing scripts.
//  2. DOM cards: profile links and bylines in the rendered widget.
//  3. #videoCount header total; shortfall reported as unclassified.

export type CarouselVideo = {
  title: string | null;
  creatorName: string | null;
  creatorType: CreatorClass;
};

export type CreatorClass = "influencer" | "brand" | "customer" | "unknown";

export type CarouselResult = {
  counts: VideoCounts;
  videos: CarouselVideo[];
  strategy: "json" | "dom" | "header" | "none";
};

export function classifyCreatorType(raw: string): CreatorClass {
  const value = raw.trim().toLowerCase();
  if (value.includes("influencer")) return "influencer";
  if (["vendor", "brand", "seller", "merchant", "amazon"].some((v) => value.includes(v))) {
    return "brand";
  }
  if (["customer", "shopper", "reviewer"].some((v) => value.includes(v))) return "customer";
  return "unknown";
}

export function extractCarousel(doc: Document): CarouselResult {
  const fromJson = extractFromScripts(doc);
  if (fromJson && fromJson.counts.total > 0) {
    // The state scripts hold the classified breakdown, but the image-block
    // total is the authoritative video count; report any shortfall honestly.
    const headerTotal = readHeaderCount(doc);
    if (headerTotal !== null && headerTotal > fromJson.counts.total) {
      fromJson.counts.unknown += headerTotal - fromJson.counts.total;
      fromJson.counts.total = headerTotal;
    }
    return fromJson;
  }
  const fromDom = extractFromDom(doc);
  if (fromDom.counts.total > 0) return fromDom;
  // No hydrated data (widget not scrolled into view yet, or a fetched
  // document): the image-block total is still trustworthy on its own.
  const headerTotal = readHeaderCount(doc);
  if (headerTotal !== null) {
    const counts = emptyCounts();
    counts.total = headerTotal;
    counts.unknown = headerTotal;
    return { counts, videos: [], strategy: "header" };
  }
  return fromJson ?? fromDom;
}

const CREATOR_TYPE_RE = /"creatorType"\s*:\s*"([A-Za-z_ -]+)"/g;
const TITLE_RE = /"(?:videoTitle|title)"\s*:\s*"((?:[^"\\]|\\.){0,200}?)"/g;
const CREATOR_NAME_RE = /"(?:creatorName|profileName|publicName)"\s*:\s*"((?:[^"\\]|\\.){0,120}?)"/g;

function extractFromScripts(doc: Document): CarouselResult | null {
  // Different state scripts hold DIFFERENT video sets (related videos in one,
  // the brand's image-block video in another), so aggregate across all of
  // them. Identical payloads injected twice are skipped by fingerprint.
  const counts = emptyCounts();
  const videos: CarouselVideo[] = [];
  const seenPayloads = new Set<string>();

  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const text = script.textContent;
    if (!text || text.length < 40 || !text.includes("creatorType")) continue;

    const types = allMatches(text, CREATOR_TYPE_RE);
    if (types.length === 0) continue;
    const titles = allMatches(text, TITLE_RE);
    const names = allMatches(text, CREATOR_NAME_RE);

    const fingerprint = types.join("|") + "::" + titles.join("|");
    if (seenPayloads.has(fingerprint)) continue;
    seenPayloads.add(fingerprint);

    for (const [index, raw] of types.entries()) {
      const kind = classifyCreatorType(raw);
      counts[kind] += 1;
      counts.total += 1;
      videos.push({
        title: decodeJsonString(titles[index] ?? null),
        creatorName: decodeJsonString(names[index] ?? null),
        creatorType: kind,
      });
    }
  }

  if (counts.total === 0) return null;
  return { counts, videos, strategy: "json" };
}

function extractFromDom(doc: Document): CarouselResult {
  const widget = query(doc, "videoWidget");
  if (!widget) return { counts: emptyCounts(), videos: [], strategy: "none" };

  const counts = emptyCounts();
  const videos: CarouselVideo[] = [];
  const cards = queryAll(widget, "videoCards");
  const brandName = normalizeBrand(query(doc, "productByline")?.textContent ?? "");

  for (const card of cards) {
    const creatorLink = query(card, "videoCardCreatorLink");
    const byline = (query(card, "videoCardByline")?.textContent ?? "").trim();
    let kind: CreatorClass = "unknown";
    if (creatorLink) {
      kind = "influencer";
    } else if (/^brand:/i.test(byline) || (brandName && normalizeBrand(byline) === brandName)) {
      kind = "brand";
    } else if (byline.length > 0) {
      kind = "customer";
    }
    counts[kind] += 1;
    counts.total += 1;
    videos.push({
      title: card.getAttribute("aria-label") ?? null,
      creatorName: byline || null,
      creatorType: kind,
    });
  }

  // If the page advertises more videos than we parsed cards for, trust the
  // bigger total and surface the shortfall as unclassified.
  const headerTotal = readHeaderCount(doc);
  if (headerTotal !== null && headerTotal > counts.total) {
    counts.unknown += headerTotal - counts.total;
    counts.total = headerTotal;
  }

  return { counts, videos, strategy: counts.total > 0 ? "dom" : "none" };
}

// The image block renders <span id="videoCount">18 VIDEOS</span> in the
// server HTML, so this works on live pages before the widget hydrates AND on
// statically fetched documents (order-history and storefront scans).
export function readHeaderCount(doc: ParentNode): number | null {
  const el = query(doc, "videoHeaderCount");
  const source = el?.getAttribute("data-video-count") ?? el?.textContent ?? "";
  const match = source.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function emptyCounts(): VideoCounts {
  return { total: 0, influencer: 0, brand: 0, customer: 0, unknown: 0 };
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(text) !== null) count += 1;
  return count;
}

function allMatches(text: string, re: RegExp): string[] {
  re.lastIndex = 0;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

function decodeJsonString(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function normalizeBrand(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(visit the|brand:)\s*/i, "")
    .replace(/\s*(store|shop)$/i, "")
    .trim();
}
