import { ORDER_SCAN_CAP, SCAN_CACHE_TTL_MS } from "../../shared/constants";
import { fetchDoc } from "../../amazon/html-fetch";
import { extractCarousel } from "../../amazon/video-carousel";
import { extractSignals } from "../../amazon/product-signals";
import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { createInlineBadge } from "../../ui/host";
import { getState, patchState } from "../../storage/store";
import { getCache, loadFilters, membership, type CatalogueKind } from "../../catalogue/cache";
import type { LoadedFilter } from "../../catalogue/bloom";
import { sendToBackground } from "../../shared/messages";
import { buildGapCsv, downloadCsv, type GapRow } from "./gap-csv";
import type { ContentGapFinding, Finding, VideoCounts } from "../../transport/types";
import type { CachedScan } from "../../storage/schema";
import { log } from "../../shared/log";

// Order-history content gaps: which products you already bought have few or
// zero influencer videos? Those are the easiest wins: you own the product, you
// can film today. Passive until the user clicks; then product pages are fetched
// sequentially with jitter (see html-fetch.ts), in batches so a long history is
// worked through a page at a time rather than in one huge run.

type OrderItem = {
  asin: string;
  title: string;
  url: string;
  anchor: HTMLAnchorElement;
};

type Loaded = Partial<Record<CatalogueKind, LoadedFilter>>;

const ASIN_HREF_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;

export function initOrderHistory(contentGapThreshold: number): void {
  const items = findOrderItems();
  if (items.length === 0) return;

  const section = addSection(t().contentGapsHeading);
  section.append(el("p", "note", t().contentGapsIntro(items.length)));

  // Display filters: they narrow what is shown / exported, not what is scanned.
  const noCc = checkbox(t().gapFilterNoCc);
  const noCarouselOnly = checkbox(t().gapFilterNoCarousel);
  section.append(noCc.wrap, noCarouselOnly.wrap);

  const button = el("button", "btn");
  const stopBtn = el("button", "btn secondary");
  stopBtn.textContent = t().sfStop;
  stopBtn.style.display = "none";
  const controls = el("div", "row");
  controls.append(button, stopBtn);

  const progress = el("p", "progress");
  const resultsList = el("ul", "list");
  const exportRow = el("div", "row");
  section.append(controls, progress, resultsList, exportRow);

  const gaps: GapRow[] = [];
  let offset = 0;
  let ccFilters: Loaded | null = null;
  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  const remaining = () => items.length - offset;
  const setLabel = () => {
    button.textContent =
      remaining() > 0
        ? t().gapCheckNext(Math.min(ORDER_SCAN_CAP, remaining()), remaining())
        : t().rescan;
  };
  setLabel();

  const render = () => {
    resultsList.replaceChildren();
    const shown = gaps.filter(
      (g) =>
        (!noCc.input.checked || !g.hasCc) && (!noCarouselOnly.input.checked || g.noCarousel),
    );
    for (const g of shown) {
      const li = el("li");
      li.append(el("span", "t", g.title.slice(0, 70)));
      const detail = el("span");
      detail.textContent = g.reason;
      const link = el("a", "", t().openProduct);
      (link as HTMLAnchorElement).href = g.url;
      (link as HTMLAnchorElement).target = "_blank";
      li.append(detail, link);
      resultsList.append(li);
    }
    progress.textContent = gaps.length === 0 ? t().noGaps : t().gapsFound(shown.length);

    exportRow.replaceChildren();
    if (gaps.length > 0) {
      const csvBtn = el("button", "btn secondary");
      csvBtn.textContent = t().gapExportCsv;
      csvBtn.addEventListener("click", () =>
        downloadCsv(`content-gaps-${new Date().toISOString().slice(0, 10)}.csv`, buildGapCsv(shown)),
      );
      exportRow.append(csvBtn);
    }
  };

  noCc.input.addEventListener("change", render);
  noCarouselOnly.input.addEventListener("change", render);

  button.addEventListener("click", () => {
    void (async () => {
      if (remaining() <= 0) {
        offset = 0;
        gaps.length = 0;
      }
      if (!ccFilters) ccFilters = loadFilters(await getCache());
      const batch = items.slice(offset, offset + ORDER_SCAN_CAP);
      offset += batch.length;

      button.disabled = true;
      stopBtn.style.display = "inline-block";
      abort = new AbortController();
      try {
        await scanBatch(batch, contentGapThreshold, ccFilters, progress, gaps, abort.signal);
      } finally {
        button.disabled = false;
        stopBtn.style.display = "none";
        setLabel();
        render();
      }
    })();
  });

  stopBtn.addEventListener("click", () => abort?.abort());
}

function findOrderItems(): OrderItem[] {
  const seen = new Set<string>();
  const items: OrderItem[] = [];
  for (const anchor of Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href*='/dp/'], a[href*='/gp/product/']"),
  )) {
    const match = (anchor.getAttribute("href") ?? "").match(ASIN_HREF_RE);
    if (!match || !match[1] || seen.has(match[1])) continue;
    const title = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (title.length < 8) continue; // skip thumbnails and icon links, keep title links
    seen.add(match[1]);
    items.push({
      asin: match[1],
      title,
      url: new URL(anchor.href, location.origin).toString(),
      anchor,
    });
  }
  return items;
}

async function scanBatch(
  items: OrderItem[],
  threshold: number,
  ccFilters: Loaded,
  progress: HTMLElement,
  gaps: GapRow[],
  signal: AbortSignal,
): Promise<void> {
  const state = await getState();

  for (const [index, item] of items.entries()) {
    if (signal.aborted) break;
    progress.textContent = t().checkingOrder(index + 1, items.length);

    // Cached entries written by real product-page visits carry a classified
    // breakdown. Fresh fetches only see the static HTML, where Amazon ships
    // just the image-block total (#videoCount): the creator breakdown hydrates
    // client-side and never appears in fetched documents. So a fetched page
    // yields either "N videos, makeup unknown" or the certain signal: zero.
    let counts = readCache(state.cache, item.asin);
    let inStock = state.cache[cacheKey(item.asin)]?.inStock ?? true;
    let classified = counts !== null;
    // Cached hits came from a real product visit, so a carousel existed then.
    // "No upper carousel" is only asserted from a fresh fetch (strategy none).
    let noCarousel = false;
    if (!counts) {
      try {
        const doc = await fetchDoc(productUrl(item.asin), signal);
        const carousel = extractCarousel(doc);
        const signals = extractSignals(doc, productUrl(item.asin));
        counts = carousel.counts;
        inStock = signals.inStock;
        noCarousel = carousel.strategy === "none" && carousel.counts.total === 0;
        classified = carousel.strategy === "json" || carousel.strategy === "dom";
        if (classified) {
          await patchState((s) => {
            s.cache[cacheKey(item.asin)] = {
              counts: carousel.counts,
              title: item.title,
              inStock: signals.inStock,
              ts: Date.now(),
            };
          });
        }
      } catch (error) {
        if (signal.aborted) break;
        log("order-scan", `failed for ${item.asin}`, error);
        continue;
      }
    }

    // A gap we can assert: zero videos of any kind (total is in the static
    // HTML), or a classified breakdown at or under the threshold. A product
    // with videos but no breakdown is NOT flagged: no false alarms.
    const isGap =
      inStock && (counts.total === 0 || (classified && counts.influencer <= threshold));

    annotate(item, counts, classified, threshold, noCarousel);
    if (!isGap) continue;

    const hasCc = ccFilters.cc ? membership(ccFilters, item.asin).cc : false;
    const reason = noCarousel
      ? t().gapNoCarousel
      : counts.total === 0
        ? t().gapNoVideos
        : counts.influencer === 0
          ? t().gapNoInfluencer
          : t().gapFewInfluencer(counts.influencer);

    gaps.push({
      asin: item.asin,
      title: item.title,
      url: productUrl(item.asin),
      reason,
      influencerVideos: counts.influencer,
      totalVideos: counts.total,
      noCarousel,
      hasCc,
    });

    const finding: ContentGapFinding = {
      type: "content_gap",
      asin: item.asin,
      marketplace: "amazon.com",
      title: item.title.slice(0, 200),
      gapType: counts.influencer === 0 ? "no_influencer_video" : "low_influencer_video",
      influencerVideoCount: counts.influencer,
      orderDate: null,
      detectedAt: new Date().toISOString(),
    };
    void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding });
  }
}

function annotate(
  item: OrderItem,
  counts: VideoCounts,
  classified: boolean,
  threshold: number,
  noCarousel: boolean,
): void {
  let badge: HTMLElement;
  if (noCarousel) {
    badge = createInlineBadge("gap", t().badgeNoCarousel);
  } else if (counts.total === 0) {
    badge = createInlineBadge("gap", t().badgeNoVideos);
  } else if (!classified) {
    // Static fetch: total known, creator makeup not. Say exactly that.
    badge = createInlineBadge("pending", t().badgePending(counts.total));
  } else if (counts.influencer <= threshold) {
    badge = createInlineBadge(
      "gap",
      counts.influencer === 0 ? t().badgeNoInfluencer : t().badgeInfluencerVideos(counts.influencer),
    );
  } else {
    badge = createInlineBadge("ok", t().badgeInfluencerVideos(counts.influencer));
  }
  badge.style.marginLeft = "6px";
  item.anchor.insertAdjacentElement("afterend", badge);
}

function checkbox(text: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = el("label", "row toggle");
  wrap.style.gap = "8px";
  const input = el("input");
  input.type = "checkbox";
  input.style.width = "auto";
  input.style.flex = "none";
  wrap.append(input, el("span", "note", text));
  return { wrap, input };
}

function productUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

function cacheKey(asin: string): string {
  return `amazon.com:${asin}`;
}

function readCache(cache: Record<string, CachedScan>, asin: string): VideoCounts | null {
  const hit = cache[cacheKey(asin)];
  if (hit && Date.now() - hit.ts < SCAN_CACHE_TTL_MS) return hit.counts;
  return null;
}
