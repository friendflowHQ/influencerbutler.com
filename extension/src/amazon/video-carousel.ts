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
//  0. State-script `videos` array, classified by aciContentId namespace
//     (.ive.seller. -> brand, .vse.video. -> influencer, .customer. ->
//     customer). Ships the FULL list up front, so it does not wait on carousel
//     hydration and recovers the "Related videos" influencer rail that layers
//     1-2 miss. Verified live 2026-07-20.
//  1. State-script JSON aggregated across all creatorType-bearing scripts
//     (only the mounted card's creatorType hydrates).
//  2. DOM cards: profile links and bylines in the rendered widget.
//  3. #videoCount header total; shortfall reported as unclassified.

export type CarouselVideo = {
  title: string | null;
  creatorName: string | null;
  creatorType: CreatorClass;
  // Best-effort link to the video's detail page, when the payload carries one.
  url: string | null;
  // Which on-page carousel the video came from (see carouselSourceFor).
  carousel: CarouselSource;
};

export type CreatorClass = "influencer" | "brand" | "customer" | "unknown";

// The competitor's "Upper" vs "Lower" carousel: the brand's hero video lives in
// the image block (upper); influencer and customer "Videos for this product"
// live in the related-videos rail (lower).
export type CarouselSource = "upper" | "lower" | "unknown";

export type CarouselResult = {
  counts: VideoCounts;
  videos: CarouselVideo[];
  strategy: "videoList" | "json" | "dom" | "header" | "none";
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

// Classify a video by its Amazon content-id namespace (the `aciContentId` on
// each entry of the state-script `videos` array). This is the most reliable
// signal because Amazon ships the FULL video list up front, whereas per-video
// creatorType only hydrates for the one carousel card currently mounted (so the
// "Related videos" influencer rail is systematically missed until scrolled).
//   amzn1.ive.seller.video.*  -> brand   (the listing's own brand/seller videos)
//   amzn1.vse.video.*         -> influencer (creator "Videos"/"Related videos")
//   amzn1.ive.influencer.*    -> influencer
//   *.customer.video/review.* -> customer
//   anything else             -> unknown (honest; never guessed)
export function classifyVideoAci(aci: string): CreatorClass {
  const v = (aci ?? "").trim().toLowerCase();
  if (!v) return "unknown";
  if (v.includes(".ive.seller.")) return "brand";
  if (v.includes(".customer.video.") || v.includes(".customer.review.")) return "customer";
  if (v.includes(".vse.video.") || v.includes(".ive.influencer.")) return "influencer";
  return "unknown";
}

// Infer a video's carousel from the request URL or its owning state-script key.
// Markers observed live on amazon.com product pages (2026-07-04); the exact set
// is pinned during Deep Scan's live verification, so keep this list easy to
// extend. Anything unrecognized stays "unknown" rather than guessing a side.
export function carouselSourceFor(marker: string): CarouselSource {
  const m = (marker || "").toLowerCase();
  if (/imageblock|heroquickview|detailpage-imageblock-player/.test(m)) return "upper";
  if (/vse|related-?videos|vftphero|related-products/.test(m)) return "lower";
  return "unknown";
}

// How many videos a result actually classified (vs honest unknowns).
export function classifiedCount(result: CarouselResult | null): number {
  if (!result) return 0;
  return result.counts.total - result.counts.unknown;
}

// Amazon serves several widget variants (state scripts, hero + rail DOM)
// and none is reliably present, so extract from every source available,
// including any network payloads the page hook captured (extras), and keep
// whichever classified the most videos. The image-block total (#videoCount)
// is authoritative for the grand total; shortfall is reported as
// unclassified.
export function extractCarousel(doc: Document, extras: CarouselResult[] = []): CarouselResult {
  const candidates: CarouselResult[] = [...extras];
  const fromVideoList = extractFromVideoList(doc);
  if (fromVideoList) candidates.push(fromVideoList);
  const fromJson = extractFromScripts(doc);
  if (fromJson) candidates.push(fromJson);
  const fromDom = extractFromDom(doc);
  candidates.push(fromDom);

  let best: CarouselResult | null = null;
  for (const candidate of candidates) {
    if (
      !best ||
      classifiedCount(candidate) > classifiedCount(best) ||
      (classifiedCount(candidate) === classifiedCount(best) &&
        candidate.counts.total > best.counts.total)
    ) {
      best = candidate;
    }
  }

  const headerTotal = readHeaderCount(doc);
  if (best && best.counts.total > 0) {
    if (headerTotal !== null && headerTotal > best.counts.total) {
      best = {
        ...best,
        counts: {
          ...best.counts,
          unknown: best.counts.unknown + (headerTotal - best.counts.total),
          total: headerTotal,
        },
      };
    }
    return best;
  }
  // No hydrated data (widget not scrolled into view yet, or a fetched
  // document): the image-block total is still trustworthy on its own.
  if (headerTotal !== null) {
    const counts = emptyCounts();
    counts.total = headerTotal;
    counts.unknown = headerTotal;
    return { counts, videos: [], strategy: "header" };
  }
  return best ?? fromDom;
}

// One aciContentId per video in the state-script `videos` array. Scoped (below)
// to scripts that also carry `creatorProfile`, i.e. the video-widget payload.
const ACI_CONTENT_ID_RE = /"aciContentId"\s*:\s*"([^"]+)"/g;

// Strategy 0 (most reliable): the state-script `videos` array. Amazon ships the
// full list up front with one aciContentId per video, whose namespace is the
// authoritative creator class (see classifyVideoAci). Unlike creatorType/DOM,
// this does NOT depend on the lazy carousel hydrating, so it recovers the
// influencer/creator videos in the "Related videos for this product" rail that
// the other strategies miss. Verified live 2026-07-20 (B0FF3XWN8H: 3 brand +
// 5 influencer = 8, matching #videoCount, where creatorType saw only 1).
function extractFromVideoList(doc: Document): CarouselResult | null {
  const counts = emptyCounts();
  const videos: CarouselVideo[] = [];
  const seenAci = new Set<string>();

  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const text = script.textContent;
    // Both markers gate this to the video-widget data script and keep stray
    // aciContentId references (unrelated widgets) out of the count.
    if (!text || !text.includes("aciContentId") || !text.includes("creatorProfile")) continue;
    ACI_CONTENT_ID_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ACI_CONTENT_ID_RE.exec(text)) !== null) {
      const aci = match[1];
      // A video can be listed under more than one group payload (IB_G1/IB_G2);
      // dedupe by content id so it is counted once.
      if (!aci || seenAci.has(aci)) continue;
      seenAci.add(aci);
      const kind = classifyVideoAci(aci);
      counts[kind] += 1;
      counts.total += 1;
      videos.push({
        title: null,
        creatorName: null,
        creatorType: kind,
        url: null,
        // Seller videos live in the image block (upper); vse creator videos in
        // the related-videos rail (lower).
        carousel: kind === "brand" ? "upper" : kind === "unknown" ? "unknown" : "lower",
      });
    }
  }

  if (counts.total === 0) return null;
  return { counts, videos, strategy: "videoList" };
}

const CREATOR_TYPE_RE = /"creatorType"\s*:\s*"([A-Za-z_ -]+)"/g;
const TITLE_RE = /"(?:videoTitle|title)"\s*:\s*"((?:[^"\\]|\\.){0,200}?)"/g;
const CREATOR_NAME_RE = /"(?:creatorName|profileName|publicName)"\s*:\s*"((?:[^"\\]|\\.){0,120}?)"/g;
// Only http(s) values under video-specific keys, so this never collides with an
// unrelated "url" field. Best-effort: used for the CSV export link.
const VIDEO_URL_RE =
  /"(?:videoUrl|vdpUrl|videoPageUrl|shareUrl)"\s*:\s*"(https?:(?:[^"\\]|\\.){0,300}?)"/g;

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
    // The a-state key (or the script id) tells us which carousel this payload
    // feeds, so the videos it holds are tagged upper vs lower.
    const marker = `${script.getAttribute("data-a-state") ?? ""} ${script.id ?? ""}`;
    accumulateFromText(text, counts, videos, seenPayloads, carouselSourceFor(marker));
  }

  if (counts.total === 0) return null;
  return { counts, videos, strategy: "json" };
}

// Extracts a classified result from any raw text payload carrying
// creatorType markers: used for the network responses the page hook
// captures from the video widget's own data fetch. `source` tags every video
// with the carousel it came from (derived by the caller from the request URL).
export function extractFromText(
  text: string,
  source: CarouselSource = "unknown",
): CarouselResult | null {
  if (!text || !text.includes("creatorType")) return null;
  const counts = emptyCounts();
  const videos: CarouselVideo[] = [];
  accumulateFromText(text, counts, videos, new Set<string>(), source);
  if (counts.total === 0) return null;
  return { counts, videos, strategy: "json" };
}

function accumulateFromText(
  text: string,
  counts: VideoCounts,
  videos: CarouselVideo[],
  seenPayloads: Set<string>,
  source: CarouselSource = "unknown",
): void {
  const types = allMatches(text, CREATOR_TYPE_RE);
  if (types.length === 0) return;
  const titles = allMatches(text, TITLE_RE);
  const names = allMatches(text, CREATOR_NAME_RE);
  // URLs only align to videos reliably when there is exactly one per video;
  // otherwise a positional map would attach wrong links, so we drop them.
  const urls = allMatches(text, VIDEO_URL_RE);
  const alignedUrls = urls.length === types.length ? urls : [];

  const fingerprint = types.join("|") + "::" + titles.join("|");
  if (seenPayloads.has(fingerprint)) return;
  seenPayloads.add(fingerprint);

  for (const [index, raw] of types.entries()) {
    const kind = classifyCreatorType(raw);
    counts[kind] += 1;
    counts.total += 1;
    videos.push({
      title: decodeJsonString(titles[index] ?? null),
      creatorName: decodeJsonString(names[index] ?? null),
      creatorType: kind,
      url: decodeJsonString(alignedUrls[index] ?? null),
      carousel: source,
    });
  }
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
    const cardText = (card.textContent ?? "").replace(/\s+/g, " ");
    let kind: CreatorClass = "unknown";
    if (creatorLink || /earns commissions/i.test(cardText)) {
      // Amazon's FTC disclosure label only appears on influencer videos.
      kind = "influencer";
    } else if (/^brand:/i.test(byline) || (brandName && normalizeBrand(byline) === brandName)) {
      kind = "brand";
    } else if (byline.length > 0) {
      kind = "customer";
    }
    counts[kind] += 1;
    counts.total += 1;
    const videoLink = card.querySelector<HTMLAnchorElement>(
      "a[href*='/vdp/'], [data-video-url], [data-vdp-url]",
    );
    const href =
      videoLink?.getAttribute("href") ??
      videoLink?.getAttribute("data-video-url") ??
      videoLink?.getAttribute("data-vdp-url") ??
      null;
    videos.push({
      title: card.getAttribute("aria-label") ?? null,
      creatorName: byline || null,
      creatorType: kind,
      url: href,
      // The related-videos widget is the lower rail; the brand hero video lives
      // in the image block, which is not part of this widget's cards.
      carousel: "lower",
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
