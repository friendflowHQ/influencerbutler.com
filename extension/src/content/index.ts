import { detectPageType, type PageType } from "./page-type";
import {
  classifiedCount,
  extractCarousel,
  extractFromText,
  type CarouselResult,
} from "../amazon/video-carousel";
import { extractSignals, type ProductSignals } from "../amazon/product-signals";
import { renderVideoCounts } from "../tools/video-counts/product-panel";
import { initOrderHistory } from "../tools/video-counts/order-history";
import { initOrdersButler } from "../tools/orders-butler/harvester";
import { evaluateApproved, criteriaToRecord } from "../tools/butler-approved/criteria";
import { renderSeal } from "../tools/butler-approved/seal";
import { renderCalculator } from "../tools/calculator/panel";
import { renderHudActions } from "../tools/hud-actions/panel";
import { initStorefrontPanel } from "../tools/storefront-check/panel";
import { guard } from "../shared/guard";
import { setDebug, log } from "../shared/log";
import { getSettings, patchState } from "../storage/store";
import { removeHost } from "../ui/host";
import { sendToBackground, type PageStatus, type RuntimeMessage } from "../shared/messages";
import type { Finding, ProductScanFinding } from "../transport/types";

// Content-script entry: detect the page, run the enabled tools, answer the
// popup's status requests, and re-run on SPA navigation (the storefront is a
// React app; product and order pages are mostly full loads).

let currentUrl = "";
let lastStatus: PageStatus = { pageType: "other", toolSummaries: [] };
// Video-widget network payloads captured by the MAIN-world page hook
// (src/content/page-hook.ts), plus how much the rendered panel classified.
let capturedVideoData: CarouselResult[] = [];
let renderedClassified = -1;

void main();

async function main(): Promise<void> {
  const settings = await getSettings();
  setDebug(settings.debug);
  watchSpaNavigation();
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.kind === "GET_PAGE_STATUS") {
      sendResponse(lastStatus);
      return true;
    }
    return false;
  });
  document.addEventListener("ib-ext-video-data", (event) => {
    guard("video-data-hook", () => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      const result = extractFromText(detail);
      if (!result) return;
      capturedVideoData.push(result);
      log("content", `captured widget payload: ${classifiedCount(result)} classified`);
      rebuildIfImproved();
    });
  });
  await runForPage();
}

// The widget's classified data can land well after first render (it only
// loads once the video section is on screen). Whenever a better source
// appears, rebuild the panel from scratch.
function rebuildIfImproved(): void {
  const probe = extractCarousel(document, capturedVideoData);
  if (classifiedCount(probe) > renderedClassified) {
    removeHost();
    void runForPage();
  }
}

async function runForPage(): Promise<void> {
  currentUrl = location.href;
  const pageType = detectPageType(currentUrl);
  const settings = await getSettings();
  lastStatus = { pageType, toolSummaries: [] };
  log("content", `page type: ${pageType}`);

  if (pageType === "product") {
    guard("product-tools", () => {
      const carousel = extractCarousel(document, capturedVideoData);
      renderedClassified = classifiedCount(carousel);
      const signals = extractSignals(document, currentUrl);

      if (settings.tools.videoCounts) {
        guard("video-counts", () => renderVideoCounts(carousel));
        lastStatus.toolSummaries.push({
          label: "Videos",
          value: `${carousel.counts.total} total, ${carousel.counts.influencer} influencer`,
        });
      }

      let approvedRecord: Record<string, boolean> | undefined;
      let approvedFlag = false;
      if (settings.tools.approved) {
        guard("butler-approved", () => {
          const verdict = evaluateApproved(signals, carousel.counts, settings.approved);
          renderSeal(verdict);
          approvedRecord = criteriaToRecord(verdict);
          approvedFlag = verdict.approved;
          lastStatus.toolSummaries.push({
            label: "Butler Approved",
            value: verdict.approved ? "Yes" : "No",
          });
        });
      }

      if (settings.tools.calculator) {
        guard("calculator", () => renderCalculator(signals, carousel.counts, settings));
      }

      // The bridge to the desktop app (push to workspaces, accept campaigns)
      // plus the download/trial upsell when the app is not running.
      guard("hud-actions", () => renderHudActions(signals));

      emitProductScan(signals, carousel, approvedFlag, approvedRecord);

      // The video widget's classified data only hydrates once it scrolls
      // into view, and may arrive via state scripts, rail DOM, or the
      // network hook. While any videos remain unclassified, keep polling
      // the DOM sources and rebuild when coverage improves.
      if (carousel.counts.unknown > 0) watchForVideoHydration();
    });
  } else if (pageType === "order-history") {
    guard("order-history", () => {
      if (settings.tools.videoCounts) initOrderHistory(settings.contentGapThreshold);
      if (settings.tools.ordersButler) initOrdersButler("amazon.com");
      lastStatus.toolSummaries.push({ label: "Order scan", value: "Ready" });
    });
  } else if (pageType === "storefront") {
    guard("storefront", () => {
      if (settings.tools.storefront) initStorefrontPanel();
      lastStatus.toolSummaries.push({ label: "Storefront checkup", value: "Ready" });
    });
  }
}

// Re-extract every 2.5s until classification coverage stops improving (the
// user scrolling the video section into view is what triggers Amazon to
// load the data). Gives up after 2 minutes; the network hook can still
// trigger a rebuild any time after that.
let hydrationWatch: number | null = null;

function watchForVideoHydration(): void {
  if (hydrationWatch !== null) return;
  const startedFor = currentUrl;
  let tries = 0;
  hydrationWatch = window.setInterval(() => {
    tries += 1;
    if (location.href !== startedFor || tries > 48) {
      if (hydrationWatch !== null) window.clearInterval(hydrationWatch);
      hydrationWatch = null;
      return;
    }
    rebuildIfImproved();
  }, 2500);
}

function emitProductScan(
  signals: ProductSignals,
  carousel: CarouselResult,
  approved: boolean,
  approvedCriteria?: Record<string, boolean>,
): void {
  if (!signals.asin || carousel.strategy === "none") return;
  // Cache classified live extractions so the order-history scan can reuse
  // real breakdowns for products the user has actually viewed.
  if (carousel.strategy === "json" || carousel.strategy === "dom") {
    const asin = signals.asin;
    void patchState((s) => {
      s.cache[`${signals.marketplace}:${asin}`] = {
        counts: carousel.counts,
        title: signals.title?.slice(0, 200),
        inStock: signals.inStock,
        ts: Date.now(),
      };
    });
  }
  const finding: ProductScanFinding = {
    type: "product_scan",
    asin: signals.asin,
    marketplace: signals.marketplace,
    title: signals.title?.slice(0, 200),
    priceCents: signals.priceCents,
    currency: signals.currency,
    counts: carousel.counts,
    approved,
    approvedCriteria,
    scannedAt: new Date().toISOString(),
  };
  void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding }).catch(() => {
    // background may be waking up; the next page view will resend
  });
}

// The storefront SPA rewrites history instead of reloading. Watch pushState,
// popstate, and a low-frequency fallback so we rebuild the panel per view.
function watchSpaNavigation(): void {
  const notice = () => {
    if (location.href === currentUrl) return;
    capturedVideoData = [];
    renderedClassified = -1;
    removeHost();
    void runForPage();
  };
  const wrap = (name: "pushState" | "replaceState") => {
    const original = history[name].bind(history);
    history[name] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      setTimeout(notice, 400);
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", () => setTimeout(notice, 400));
  setInterval(notice, 3000);
}
