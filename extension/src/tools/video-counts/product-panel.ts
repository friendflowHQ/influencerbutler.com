import { addSection, chip, collapsible, el } from "../../ui/components";
import { t } from "../../i18n";
import { classifiedCount, type CarouselResult, type CarouselVideo } from "../../amazon/video-carousel";
import { query } from "../../amazon/selectors";
import { harvestVideos, type VideoHarvestResult } from "../../amazon/video-harvest";
import type { VideoCounts } from "../../transport/types";
import { buildVideoCsv, downloadCsv } from "./video-csv";

const POLL_TRIES = 12;
const POLL_INTERVAL_MS = 1200;

// The headline tool: who owns this product's video carousel? The passive view
// shows whatever hydrated on its own; Deep Scan actively harvests every video
// Amazon will serve and splits them into upper (brand hero) and lower (related)
// carousels, like the competitor's "Deep Scan & Share".
export function renderVideoCounts(
  result: CarouselResult,
  endpoints: string[] = [],
  reextract?: () => CarouselResult,
): void {
  const section = addSection(t().videoCompetition);

  if (result.counts.total === 0) {
    // No upper carousel at all vs a carousel that exists but is empty are very
    // different signals: the first means a video here will not surface on the
    // listing, the second is a wide-open opportunity. Make each a clear seal.
    const callout = el("div", result.strategy === "none" ? "seal warn" : "seal pass");
    callout.textContent = result.strategy === "none" ? t().noCarousel : t().noVideosYet;
    section.append(callout);
    return;
  }

  if (result.strategy === "header") {
    const pending = el("p", "note");
    pending.textContent = t().videosPending(result.counts.total);
    section.append(pending);
  } else {
    const counts = el("div", "counts");
    counts.append(
      chip("influencer", t().chipInfluencer(result.counts.influencer)),
      chip("brand", t().chipBrand(result.counts.brand)),
      chip("customer", t().chipCustomer(result.counts.customer)),
    );
    if (result.counts.unknown > 0) {
      counts.append(chip("", t().chipUnclassified(result.counts.unknown)));
    }
    section.append(counts);

    const summary = el("p", "note");
    summary.textContent = t().videosTotalVia(result.counts.total, result.strategy === "json");
    section.append(summary);

    renderInfluencerList(section, result.videos, result.counts.influencer);
  }

  // Deep Scan is only worth offering when Amazon claims more videos than we
  // have classified so far (the shortfall lives in counts.unknown).
  if (result.counts.unknown > 0) {
    renderDeepScan(section, result, endpoints, reextract);
  }
}

function renderInfluencerList(
  section: HTMLElement,
  videos: CarouselVideo[],
  influencerCount: number,
): void {
  const influencers = videos.filter(
    (v) => v.creatorType === "influencer" && (v.creatorName || v.title),
  );
  if (influencers.length === 0) return;
  // Label with the true influencer count so the header matches the chip (the
  // old code labelled with the shown slice, making it look like videos were
  // missing). Show them all, with a high safety cap for the rare huge rail.
  const CAP = 25;
  const shown = influencers.slice(0, CAP);
  const content = collapsible(section, t().influencerVideosLabel(influencerCount), { open: true });
  const list = el("ul", "list");
  for (const video of shown) {
    const item = el("li");
    item.append(el("span", "t", video.creatorName ?? t().influencerFallback));
    if (video.title) item.append(el("span", "", video.title.slice(0, 70)));
    list.append(item);
  }
  content.append(list);
  if (influencers.length > CAP) {
    content.append(el("p", "note", t().influencerVideosMore(influencers.length - CAP)));
  }
}

function renderDeepScan(
  section: HTMLElement,
  seed: CarouselResult,
  endpoints: string[],
  reextract?: () => CarouselResult,
): void {
  // The header top-up already made counts.total authoritative (Amazon's own
  // #videoCount), so it is the target the harvest counts up toward.
  const headerTotal = seed.counts.total;

  const wrap = el("div", "section");
  const intro = el("p", "note", t().deepScanIntro);

  const button = el("button", "btn") as HTMLButtonElement;
  button.textContent = t().deepScan;
  const stopBtn = el("button", "btn secondary") as HTMLButtonElement;
  stopBtn.textContent = t().deepScanStop;
  stopBtn.style.display = "none";
  const controls = el("div", "row");
  controls.append(button, stopBtn);

  const progress = el("p", "progress");
  const results = el("div");
  wrap.append(intro, controls, progress, results);
  section.append(wrap);

  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());
  stopBtn.addEventListener("click", () => abort?.abort());

  button.addEventListener("click", () => {
    abort = new AbortController();
    const signal = abort.signal;
    button.disabled = true;
    stopBtn.style.display = "inline-block";
    results.replaceChildren();
    progress.textContent = t().deepScanRunning(classifiedCount(seed), 0);

    const onProgress = (p: { videos: number; pages: number }) =>
      (progress.textContent = t().deepScanRunning(p.videos, p.pages));

    // Primary source: the live DOM. Amazon server-renders every video's
    // creatorType into state scripts that appear once the widget is on screen
    // (verified live 2026-07-06: 2 scripts, keys detailpage-imageblock-player-*
    // = upper and vftphero-related-products = lower). We nudge the widget into
    // view and re-extract until classification stops improving, then extend via
    // the network pager for any layout that DOES page videos behind an XHR.
    void hydrateFromDom(reextract ?? (() => seed), headerTotal, onProgress, signal)
      .then((hydrated) => harvestVideos(endpoints, hydrated, headerTotal, onProgress, signal))
      .then((harvest) => {
        renderHarvest(results, harvest);
        const classified = harvest.counts.total;
        const total = Math.max(harvest.headerTotal ?? classified, classified);
        progress.textContent = t().deepScanDone(classified, total);
        if (harvest.capped || classified < total) {
          results.append(el("p", "note", t().deepScanPartial));
        }
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") progress.textContent = t().deepScanStopped;
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = t().deepScanRescan;
        stopBtn.style.display = "none";
      });
  });
}

// Poll the live DOM re-extraction, nudging the video widget into view so Amazon
// hydrates its state scripts, until every video is classified (or the header
// total is reached, or we run out of tries / the user stops).
async function hydrateFromDom(
  reextract: () => CarouselResult,
  headerTotal: number | null,
  onProgress: (p: { videos: number; pages: number }) => void,
  signal: AbortSignal,
): Promise<CarouselResult> {
  let best = reextract();
  for (let i = 0; i < POLL_TRIES; i += 1) {
    if (signal.aborted) break;
    if (best.counts.unknown === 0) break;
    if (headerTotal !== null && classifiedCount(best) >= headerTotal) break;
    nudgeWidgetIntoView();
    await sleep(POLL_INTERVAL_MS, signal);
    const probe = reextract();
    if (classifiedCount(probe) > classifiedCount(best)) best = probe;
    onProgress({ videos: classifiedCount(best), pages: 0 });
  }
  return best;
}

// Briefly bring the video widget on screen (then restore scroll) to trip
// Amazon's lazy hydration, mirroring the passive auto-hydrate in content/index.
function nudgeWidgetIntoView(): void {
  const widget = query(document, "videoWidget");
  if (!widget) return;
  const rect = widget.getBoundingClientRect();
  if (rect.bottom > 0 && rect.top < window.innerHeight) return; // already visible
  const x = window.scrollX;
  const y = window.scrollY;
  try {
    widget.scrollIntoView({ block: "center" });
  } catch {
    return;
  }
  window.setTimeout(() => {
    try {
      window.scrollTo(x, y);
    } catch {
      // ignore
    }
  }, 400);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function renderHarvest(container: HTMLElement, harvest: VideoHarvestResult): void {
  container.replaceChildren();

  container.append(el("p", "note", t().estTotalVideos(harvest.headerTotal ?? harvest.counts.total)));
  container.append(sourceRow(t().upperCarousel, harvest.upper));
  container.append(sourceRow(t().lowerCarousel, harvest.lower));

  if (harvest.videos.length > 0) {
    const content = collapsible(container, t().allVideosLabel(harvest.videos.length), { open: false });
    const list = el("ul", "list");
    for (const v of harvest.videos.slice(0, 200)) {
      const item = el("li");
      item.append(el("span", "t", v.creatorName ?? t().influencerFallback));
      item.append(el("span", "", (v.title ?? t().videoNoTitle).slice(0, 70)));
      list.append(item);
    }
    content.append(list);
  }

  const exportRow = el("div", "row");
  const csvBtn = el("button", "btn secondary");
  csvBtn.textContent = t().videoExportCsv;
  csvBtn.addEventListener("click", () =>
    downloadCsv(
      `product-videos-${new Date().toISOString().slice(0, 10)}.csv`,
      buildVideoCsv(harvest.videos),
    ),
  );
  const copyBtn = el("button", "btn secondary") as HTMLButtonElement;
  copyBtn.textContent = t().copySummary;
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard
      .writeText(buildShareSummary(harvest))
      .then(() => {
        copyBtn.textContent = t().copied;
        setTimeout(() => (copyBtn.textContent = t().copySummary), 1500);
      })
      .catch(() => undefined);
  });
  exportRow.append(csvBtn, copyBtn);
  container.append(exportRow);
}

function sourceRow(label: string, counts: VideoCounts): HTMLElement {
  const row = el("div", "counts");
  row.append(el("span", "t", `${label}: ${counts.total}`));
  row.append(
    chip("brand", t().chipBrand(counts.brand)),
    chip("influencer", t().chipInfluencer(counts.influencer)),
  );
  if (counts.customer > 0) row.append(chip("customer", t().chipCustomer(counts.customer)));
  return row;
}

// Plain-text block for pasting into a chat or group. Localized via t(); built
// here (not in video-csv.ts) so it picks up the active locale.
function buildShareSummary(h: VideoHarvestResult): string {
  const total = h.headerTotal ?? h.counts.total;
  const lines = [
    t().shareSummaryHeading,
    t().estTotalVideos(total),
    `${t().upperCarousel}: ${h.upper.total} (${t().chipBrand(h.upper.brand)}, ${t().chipInfluencer(
      h.upper.influencer,
    )})`,
    `${t().lowerCarousel}: ${h.lower.total} (${t().chipInfluencer(
      h.lower.influencer,
    )}, ${t().chipCustomer(h.lower.customer)})`,
  ];
  const topCreators = h.videos
    .filter((v) => v.creatorType === "influencer" && v.creatorName)
    .slice(0, 5)
    .map((v) => v.creatorName as string);
  if (topCreators.length > 0) lines.push(`${t().shareTopCreators} ${topCreators.join(", ")}`);
  return lines.join("\n");
}
