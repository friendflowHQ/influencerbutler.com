import { detectPageType, type PageType } from "./page-type";
import {
  carouselSourceFor,
  classifiedCount,
  extractCarousel,
  extractFromText,
  type CarouselResult,
} from "../amazon/video-carousel";
import { extractSignals, type ProductSignals } from "../amazon/product-signals";
import { query } from "../amazon/selectors";
import { renderVideoCounts } from "../tools/video-counts/product-panel";
import { initOrderHistory } from "../tools/video-counts/order-history";
import { initOrdersButler } from "../tools/orders-butler/harvester";
import { initOrderVideoCounts } from "../tools/orders-butler/video-count-runner";
import { evaluateApproved, criteriaToRecord } from "../tools/butler-approved/criteria";
import { renderSeal } from "../tools/butler-approved/seal";
import { renderProductScore } from "../tools/score/panel";
import { renderCalculator } from "../tools/calculator/panel";
import { renderProductSnapshot } from "../tools/product-snapshot/panel";
import { renderProductEarnings } from "../tools/earnings/panel";
import { renderPriceHistory } from "../tools/price-history/panel";
import { renderInlineCard } from "../tools/inline-card/panel";
import { renderCampaigns } from "../tools/campaigns/panel";
import { renderHudActions } from "../tools/hud-actions/panel";
import { renderMyLink } from "../tools/my-link/panel";
import { renderShotList } from "../tools/shot-list/panel";
import { initStorefrontPanel } from "../tools/storefront-check/panel";
import { initEarningsOverlay } from "../tools/earnings-overlay/overlay";
import { initUploadHelper } from "../tools/upload-helper/panel";
import { initSearchOverlay } from "../tools/search-overlay/overlay";
import { initStoreOverlay } from "../tools/store-overlay/overlay";
import { initCampaignMatcher } from "../tools/campaign-matcher/panel";
import { initCampaignRadar } from "../tools/campaign-radar/overlay";
import { renderWatchButton } from "../tools/watchlist/panel";
import { maybeShowNudge } from "../tools/nudges/prompts";
import { maybeShowUpdateBanner } from "../tools/update-banner";
import { guard } from "../shared/guard";
import { channelAllowed } from "../shared/creator-mode";
import { setDebug, log } from "../shared/log";
import { setLocale, t } from "../i18n";
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
// The request URLs those payloads came from, so Deep Scan can replay the
// widget's own endpoint with pagination instead of guessing one.
let capturedVideoUrls: string[] = [];
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
      // The hook now sends { url, body }; tolerate the old bare-string shape.
      const raw = (event as CustomEvent<unknown>).detail;
      const { url, body } =
        typeof raw === "string"
          ? { url: "", body: raw }
          : (raw as { url?: unknown; body?: unknown });
      if (typeof body !== "string") return;
      const requestUrl = typeof url === "string" ? url : "";
      const result = extractFromText(body, carouselSourceFor(requestUrl));
      if (!result) return;
      capturedVideoData.push(result);
      if (requestUrl && !capturedVideoUrls.includes(requestUrl)) {
        capturedVideoUrls.push(requestUrl);
      }
      log("content", `captured widget payload: ${classifiedCount(result)} classified`);
      rebuildIfImproved();
    });
  });
  await runForPage();
  // Re-engagement nudges (join the group, get the free app). Records first use
  // on the first run and shows a timed modal on later visits. Guarded so a
  // failure here never breaks the tools.
  guard("nudges", () => maybeShowNudge());
  // Extension-update pill (Chrome has a new version staged). Lives in its own
  // shadow host and runs once per page load, so it belongs here rather than in
  // runForPage(), which re-runs on SPA navigation.
  guard("update-banner", () => void maybeShowUpdateBanner());
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
  setLocale(settings.locale);
  lastStatus = { pageType, toolSummaries: [] };
  log("content", `page type: ${pageType}`);

  // Creator-mode channel filter (mirrored from the app). onsite tools are the
  // Amazon on-platform ones (video counts, Butler Approved, campaigns, shot
  // list, storefront checkup, order scan, upload helper, campaign radar);
  // offsite is the affiliate/deeplink "My Link" action. Channel-neutral tools
  // (snapshot, earnings, price history, inline card, score, calculator, HUD
  // actions, watchlist, search overlay) always run. "both" allows everything.
  const showOnsite = channelAllowed(settings.creatorMode, "onsite");
  const showOffsite = channelAllowed(settings.creatorMode, "offsite");

  if (pageType === "product") {
    guard("product-tools", () => {
      const carousel = extractCarousel(document, capturedVideoData);
      renderedClassified = classifiedCount(carousel);
      const signals = extractSignals(document, currentUrl);

      // Identity card first: the ASINs, category, rank, and rate at a glance.
      guard("product-snapshot", () => renderProductSnapshot(signals));

      // Your real earnings on this exact product (from the desktop app ledger,
      // over the bridge). Reserves a slot here; reveals only if paired and there
      // are earnings, so it stays invisible for everyone else.
      guard("earnings", () => renderProductEarnings(signals));

      // Price history sparkline, built locally from prices seen while browsing.
      // Reserves a slot; reveals only once there are at least two observations.
      guard("price-history", () => renderPriceHistory(signals));

      // Inline card at the buybox: identity, Creator-API market availability,
      // and a one-tap Collab Butler action (injected into the page, not the
      // floating panel).
      guard("inline-card", () => renderInlineCard(signals));

      if (showOnsite && settings.tools.videoCounts) {
        guard("video-counts", () =>
          renderVideoCounts(carousel, capturedVideoUrls, () =>
            extractCarousel(document, capturedVideoData),
          ),
        );
        lastStatus.toolSummaries.push({
          label: t().sumVideos,
          value: t().sumVideosValue(carousel.counts.total, carousel.counts.influencer),
        });
      }

      let approvedRecord: Record<string, boolean> | undefined;
      let approvedFlag = false;
      if (showOnsite && settings.tools.approved) {
        guard("butler-approved", () => {
          const verdict = evaluateApproved(signals, carousel.counts, settings.approved);
          renderSeal(verdict);
          approvedRecord = criteriaToRecord(verdict);
          approvedFlag = verdict.approved;
          lastStatus.toolSummaries.push({
            label: t().sumApproved,
            value: verdict.approved ? t().yes : t().no,
          });
        });
      }

      // Butler Score: the 0-100 opportunity number. Complements the seal (same
      // signals, continuous instead of pass/fail). Async because it reads the
      // cached rate card and campaign catalogue; pushes its popup summary line
      // once computed.
      guard("butler-score", () =>
        void renderProductScore(signals, carousel.counts, settings).then((value) => {
          if (value !== null) {
            lastStatus.toolSummaries.push({ label: t().sumScore, value: String(value) });
          }
        }),
      );

      if (settings.tools.calculator) {
        guard("calculator", () => renderCalculator(signals, carousel.counts, settings));
      }

      // Campaign availability from the locally-cached membership filter.
      if (showOnsite) guard("campaigns", () => void renderCampaigns(signals));

      // The bridge to the desktop app (push to workspaces, accept campaigns)
      // plus the download/trial upsell when the app is not running.
      guard("hud-actions", () => renderHudActions(signals));

      // My affiliate/deeplink for this product, plus an optional AI caption.
      // The flagship offsite action (share off-Amazon), so onsite-only creators
      // do not see it.
      if (showOffsite) guard("my-link", () => void renderMyLink(signals));

      // A product-specific filming plan: the features to show plus best-practice
      // beats and the FTC disclosure. Pairs with Butler Approved (what to film)
      // and My Link (where to send viewers).
      if (showOnsite) guard("shot-list", () => renderShotList(signals));

      // Watch this product for a restock, an opening video slot, or a price drop.
      if (settings.tools.watchlist) {
        guard("watchlist", () => void renderWatchButton(signals));
      }

      emitProductScan(signals, carousel, approvedFlag, approvedRecord);

      // The video widget's classified data only hydrates once it scrolls
      // into view, and may arrive via state scripts, rail DOM, or the
      // network hook. Nudge it into view automatically so the user does not
      // have to scroll, then keep polling and rebuild as coverage improves.
      // Only relevant when the onsite video-counts panel is showing.
      if (showOnsite && settings.tools.videoCounts && carousel.counts.unknown > 0) {
        autoHydrateVideos();
        watchForVideoHydration();
      }
    });
  } else if (pageType === "order-history") {
    if (!showOnsite) return; // onsite-only page (content gaps, order harvest)
    guard("order-history", () => {
      if (settings.tools.videoCounts) initOrderHistory(settings.contentGapThreshold);
      if (settings.tools.ordersButler) {
        initOrdersButler("amazon.com");
        initOrderVideoCounts("amazon.com");
      }
      if (settings.tools.campaignMatcher) {
        initCampaignMatcher("orders");
        lastStatus.toolSummaries.push({ label: t().sumCampaignMatcher, value: t().ready });
      }
      lastStatus.toolSummaries.push({ label: t().sumOrderScan, value: t().ready });
    });
  } else if (pageType === "storefront") {
    if (!showOnsite) return; // onsite-only page (storefront checkup, matcher)
    guard("storefront", () => {
      if (settings.tools.storefront) initStorefrontPanel();
      if (settings.tools.campaignMatcher) {
        initCampaignMatcher("storefront");
        lastStatus.toolSummaries.push({ label: t().sumCampaignMatcher, value: t().ready });
      }
      // Per-card earnings badges + breakdown popup (the desktop ledger over the
      // bridge). Self-gates to paired users with real earnings, so it is a no-op
      // for everyone else.
      if (settings.tools.earningsOverlay) {
        guard("earnings-overlay", () => {
          void initEarningsOverlay();
          lastStatus.toolSummaries.push({ label: t().sumEarningsOverlay, value: t().ready });
        });
      }
      lastStatus.toolSummaries.push({ label: t().sumStorefrontCheckup, value: t().ready });
    });
  } else if (pageType === "creator-upload") {
    if (!showOnsite) return; // onsite-only page (Creator Hub upload helper)
    guard("upload-helper", () => {
      initUploadHelper();
      lastStatus.toolSummaries.push({ label: t().sumUploadHelper, value: t().ready });
    });
  } else if (pageType === "search") {
    guard("search-overlay", () => {
      if (settings.tools.searchOverlay) {
        void initSearchOverlay(settings);
        lastStatus.toolSummaries.push({ label: t().sumSearchOverlay, value: t().ready });
      }
    });
  } else if (pageType === "brand-store") {
    // Research overlay on a brand's own storefront. Channel-neutral, like the
    // search overlay: it scores products, it does not post anywhere.
    guard("store-overlay", () => {
      if (settings.tools.storeOverlay) {
        void initStoreOverlay(settings);
        lastStatus.toolSummaries.push({ label: t().sumStoreOverlay, value: t().ready });
      }
    });
  } else if (pageType === "campaign-grid") {
    if (!showOnsite) return; // onsite-only page (Creator Connections radar)
    guard("campaign-radar", () => {
      if (settings.tools.campaignRadar) {
        void initCampaignRadar(settings);
        lastStatus.toolSummaries.push({ label: t().sumCampaignRadar, value: t().ready });
      }
    });
  }
}

// Amazon only loads the video widget's classified data once the widget is on
// screen. Rather than make the user scroll to it, briefly bring it into view
// (long enough to trip Amazon's lazy load and our network hook), then restore
// the user's scroll position. The fetch it kicks off completes on its own
// regardless of where we scroll back to, so the visible jump is momentary.
// Runs at most once per URL; keyed so a rebuild does not re-nudge.
let autoHydratedFor: string | null = null;

function autoHydrateVideos(): void {
  if (autoHydratedFor === currentUrl) return;
  const widget = query(document, "videoWidget");
  if (!widget) return; // not rendered yet; the watcher retries on its next tick
  autoHydratedFor = currentUrl;
  const rect = widget.getBoundingClientRect();
  if (rect.bottom > 0 && rect.top < window.innerHeight) return; // already visible
  const startX = window.scrollX;
  const startY = window.scrollY;
  try {
    widget.scrollIntoView({ block: "center" });
  } catch {
    return;
  }
  window.setTimeout(() => {
    try {
      window.scrollTo(startX, startY);
    } catch {
      // ignore
    }
  }, 500);
}

// Re-extract every 2.5s until classification coverage stops improving. The
// auto-nudge (or the user scrolling the video section into view) is what
// triggers Amazon to load the data. Gives up after 2 minutes; the network
// hook can still trigger a rebuild any time after that.
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
    autoHydrateVideos();
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
    inStock: signals.inStock,
    // Product-research signals for the desktop price/rank history store.
    boughtPastMonth: signals.boughtPastMonth,
    brand: signals.brand,
    category: signals.category,
    bestsellerRank: signals.bestsellerRank,
    imageUrl: signals.imageUrl,
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
    capturedVideoUrls = [];
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
