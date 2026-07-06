import { ORDER_SCAN_CAP, SCAN_CACHE_TTL_MS } from "../../shared/constants";
import { fetchDoc } from "../../amazon/html-fetch";
import { extractCarousel } from "../../amazon/video-carousel";
import { extractSignals } from "../../amazon/product-signals";
import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { createInlineBadge } from "../../ui/host";
import { getState, patchState } from "../../storage/store";
import { sendToBackground } from "../../shared/messages";
import type { ContentGapFinding, Finding, VideoCounts } from "../../transport/types";
import type { CachedScan } from "../../storage/schema";
import { log } from "../../shared/log";

// Order-history content gaps: which products you already bought have few or
// zero influencer videos? Those are the easiest wins: you own the product,
// you can film today. Passive until the user clicks Scan; then product pages
// are fetched sequentially with jitter (see html-fetch.ts) and cached.

type OrderItem = {
  asin: string;
  title: string;
  url: string;
  anchor: HTMLAnchorElement;
};

const ASIN_HREF_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;

export function initOrderHistory(contentGapThreshold: number): void {
  const items = findOrderItems();
  if (items.length === 0) return;

  const section = addSection(t().contentGapsHeading);
  const intro = el("p", "note");
  intro.textContent = t().contentGapsIntro(items.length);
  section.append(intro);

  const progress = el("p", "progress");
  const button = el("button", "btn");
  button.textContent = t().scanTheseOrders(Math.min(items.length, ORDER_SCAN_CAP));
  section.append(button, progress);

  const resultsList = el("ul", "list");
  section.append(resultsList);

  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  button.addEventListener("click", () => {
    button.disabled = true;
    abort = new AbortController();
    void runScan(items.slice(0, ORDER_SCAN_CAP), contentGapThreshold, progress, resultsList, abort.signal)
      .finally(() => {
        button.disabled = false;
        button.textContent = t().rescan;
      });
  });
}

function findOrderItems(): OrderItem[] {
  const seen = new Set<string>();
  const items: OrderItem[] = [];
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/dp/'], a[href*='/gp/product/']"))) {
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

async function runScan(
  items: OrderItem[],
  threshold: number,
  progress: HTMLElement,
  resultsList: HTMLElement,
  signal: AbortSignal,
): Promise<void> {
  const state = await getState();
  let gaps = 0;
  resultsList.replaceChildren();

  for (const [index, item] of items.entries()) {
    if (signal.aborted) break;
    progress.textContent = t().checkingOrder(index + 1, items.length);

    // Cached entries written by real product-page visits carry a classified
    // breakdown. Fresh fetches only see the static HTML, where Amazon ships
    // just the image-block total (#videoCount): the creator breakdown
    // hydrates client-side and never appears in fetched documents (verified
    // live 2026-07-04). So a fetched page yields either "N videos, makeup
    // unknown" or the one certain signal: zero videos at all.
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
        // Only classified breakdowns are worth caching for reuse; a bare
        // total from the static page is cheap to re-derive.
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
      inStock &&
      (counts.total === 0 || (classified && counts.influencer <= threshold));

    annotate(item, counts, classified, threshold, noCarousel);

    if (isGap) {
      gaps += 1;
      const li = el("li");
      li.append(el("span", "t", item.title.slice(0, 70)));
      const detail = el("span");
      detail.textContent = noCarousel
        ? t().gapNoCarousel
        : counts.total === 0
          ? t().gapNoVideos
          : counts.influencer === 0
            ? t().gapNoInfluencer
            : t().gapFewInfluencer(counts.influencer);
      const link = el("a", "", t().openProduct);
      link.href = productUrl(item.asin);
      link.target = "_blank";
      li.append(detail, link);
      resultsList.append(li);

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

  progress.textContent = signal.aborted
    ? t().scanStopped
    : gaps > 0
      ? t().gapsFound(gaps)
      : t().noGaps;
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
