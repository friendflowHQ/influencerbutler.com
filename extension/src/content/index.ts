import { detectPageType, type PageType } from "./page-type";
import {
  carouselSourceFor,
  classifiedCount,
  extractCarousel,
  extractFromText,
  type CarouselResult,
} from "../amazon/video-carousel";
import { deriveCreatorId, deriveVideoId } from "../amazon/video-identity";
import { extractSignals, type ProductSignals } from "../amazon/product-signals";
import { query, applySelectorOverrides } from "../amazon/selectors";
import { getFlags } from "../flags/cache";
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
import { renderGlobalMaximizer } from "../tools/global-maximizer/panel";
import { renderCampaigns } from "../tools/campaigns/panel";
import { renderHudActions } from "../tools/hud-actions/panel";
import { renderMyLink } from "../tools/my-link/panel";
import { renderShotList } from "../tools/shot-list/panel";
import { initStorefrontPanel } from "../tools/storefront-check/panel";
import { initEarningsOverlay } from "../tools/earnings-overlay/overlay";
import { initUploadHelper } from "../tools/upload-helper/panel";
import { initVideoMoney } from "../tools/video-money/overlay";
import { initSearchOverlay } from "../tools/search-overlay/overlay";
import { initStoreOverlay } from "../tools/store-overlay/overlay";
import { initTrendRadar } from "../tools/trend-radar/overlay";
import { initIdeaListOverlay } from "../tools/idea-list/overlay";
import { initCampaignMatcher } from "../tools/campaign-matcher/panel";
import { initCampaignRadar } from "../tools/campaign-radar/overlay";
import { renderWatchButton } from "../tools/watchlist/panel";
import { renderProductListsPanel } from "../tools/product-lists/panel";
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
import type { CampaignFill } from "../amazon/creator-campaigns";

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
// Campaign fill / capacity captured by the MAIN-world connect-hook
// (src/content/connect-hook.ts) from the campaign/search API, keyed by
// campaignId. Merged so a later partial capture (e.g. the SPCC tab) does not
// drop the Affiliate+ fills. Fed into Campaign Radar's Last Call meter.
let campaignFills: Record<string, CampaignFill> = {};
let lastCallRefreshTimer: number | null = null;

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
  // Campaign fill / capacity from the connect-hook (Last Call Butler). Merge the
  // captured map, forward it to the background so it can alert on watched
  // campaigns even when the grid is just being browsed, and re-render the radar
  // so the fill meters appear on the cards.
  document.addEventListener("ib-ext-campaign-fill", (event) => {
    guard("campaign-fill-hook", () => {
      const detail = (event as CustomEvent<unknown>).detail;
      const fills = (detail as { fills?: unknown })?.fills;
      if (!fills || typeof fills !== "object") return;
      campaignFills = { ...campaignFills, ...(fills as Record<string, CampaignFill>) };
      void sendToBackground({
        kind: "REPORT_CAMPAIGN_FILLS",
        fills: campaignFills,
      }).catch(() => undefined);
      scheduleLastCallRefresh();
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

  // Remote operational flags win over the user's own settings: they are the
  // site's kill switch for when a tool misbehaves in the wild. Apply selector
  // overrides (config-level DOM repairs) before any tool queries the page,
  // force off any remotely-disabled tool, and bail entirely on a hard kill.
  const flags = await getFlags();
  if (flags) {
    applySelectorOverrides(flags.selectorOverrides);
    if (flags.disableAll) {
      log("content", "all tools disabled by remote flag");
      return;
    }
    for (const tool of flags.disabledTools) {
      if (tool in settings.tools) {
        (settings.tools as Record<string, boolean>)[tool] = false;
      }
    }
  }

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

      // Global Marketplace Maximizer: per-market availability, price, estimated
      // commission, and localized affiliate links so international viewers earn
      // instead of hitting a dead link. Channel-neutral (research + links);
      // gated by its own tool flag.
      if (settings.tools.globalMaximizer) {
        guard("global-maximizer", () => void renderGlobalMaximizer(signals));
      }

      if (showOnsite && settings.tools.videoCounts) {
        guard("video-counts", () =>
          renderVideoCounts(
            carousel,
            capturedVideoUrls,
            () => extractCarousel(document, capturedVideoData),
            settings.tools.videoLandscape,
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

      // Add this product (or every variation) to a named list. Free, channel-
      // neutral; the only surface that offers "Add all variations".
      guard("product-lists", () => void renderProductListsPanel(signals));

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
  } else if (pageType === "creator-manage") {
    if (!showOnsite) return; // onsite-only page (Creator Hub video-manage list)
    guard("video-money", () => {
      if (settings.tools.videoMoney) {
        void initVideoMoney(settings);
        lastStatus.toolSummaries.push({ label: t().sumVideoMoney, value: t().ready });
      }
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
  } else if (pageType === "discovery") {
    // Trend Radar over the Best Sellers / New Releases / Movers & Shakers grids.
    // Channel-neutral, like the search and brand-store overlays: it scores and
    // ranks products, it does not post anywhere.
    guard("trend-radar", () => {
      if (settings.tools.trendRadar) {
        void initTrendRadar(settings);
        lastStatus.toolSummaries.push({ label: t().sumTrendRadar, value: t().ready });
      }
    });
  } else if (pageType === "idea-list") {
    // Money signals over an Idea List's products. Channel-neutral, like the
    // search and brand-store overlays: it scores products, it does not post
    // anywhere.
    guard("idea-list-overlay", () => {
      if (settings.tools.ideaListOverlay) {
        void initIdeaListOverlay(settings);
        lastStatus.toolSummaries.push({ label: t().sumIdeaList, value: t().ready });
      }
    });
  } else if (pageType === "campaign-grid") {
    if (!showOnsite) return; // onsite-only page (Creator Connections radar)
    guard("campaign-radar", () => {
      if (settings.tools.campaignRadar) {
        void initCampaignRadar(settings, campaignFills);
        lastStatus.toolSummaries.push({ label: t().sumCampaignRadar, value: t().ready });
      }
    });
  }
}

// The connect-hook delivers fills asynchronously (after the grid's own
// campaign/search fetch), which can land after Campaign Radar first rendered.
// Debounce a re-render so the fill meters appear once the map arrives, without
// thrashing when Amazon fires several fetches in a row.
function scheduleLastCallRefresh(): void {
  if (lastCallRefreshTimer !== null) return;
  lastCallRefreshTimer = window.setTimeout(() => {
    lastCallRefreshTimer = null;
    void (async () => {
      const settings = await getSettings();
      if (detectPageType(location.href) !== "campaign-grid") return;
      if (!settings.tools.campaignRadar || !channelAllowed(settings.creatorMode, "onsite")) return;
      guard("campaign-radar-fill", () => void initCampaignRadar(settings, campaignFills));
    })();
  }, 400);
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
  // De-identified per-video placement observations for the opt-in video pool.
  // Attached to every scan; api-transport only forwards them when the user has
  // turned catalogue contribution on. Videos we cannot identify are dropped.
  const videos = carousel.videos
    .map((v) => {
      const videoId = deriveVideoId(v);
      if (!videoId) return null;
      return {
        videoId,
        creatorId: deriveCreatorId(v),
        creatorName: v.creatorName,
        creatorType: v.creatorType,
        carousel: v.carousel,
        position: v.position,
        title: v.title,
        url: v.url,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

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
    videos: videos.length > 0 ? videos : undefined,
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
