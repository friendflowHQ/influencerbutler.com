import {
  CATALOGUE_ALARM,
  CATALOGUE_PERIOD_MINUTES,
  FACEBOOK_GROUP_URL,
  SYNC_ALARM,
  SYNC_PERIOD_MINUTES,
  WATCHLIST_ALARM,
  WATCHLIST_PERIOD_MINUTES,
} from "../shared/constants";
import { enqueue, flush, queueDepth } from "../transport/router";
import { authSnapshot, signIn, signOut } from "./auth";
import { getHudStatus, sendHudCommand, lookupEarnings, fetchDesktopHistory, requestPairing, submitPairingCode, unpair } from "./hud-bridge";
import { sendFeedback } from "./feedback";
import { refreshCatalogues } from "./catalogue";
import { refreshRateCard } from "./rate-card";
import { fetchMarketAvailability } from "./market-availability";
import { enrichProducts } from "./enrich";
import { getDealSources, harvestDealSites } from "./deal-harvest";
import { handleInstagramMessage } from "./instagram";
import { getOrderAsins, noteScanFinding, scanAsinInTab } from "./order-video-scan";
import { getPriceHistory, recordPriceFromFinding } from "./price-history";
import { pollAppNotifications } from "./app-notifications";
import {
  addToWatchlist,
  getWatchlist,
  handleWatchNotificationClick,
  isWatched,
  refreshWatchlist,
  removeFromWatchlist,
  setWatchConditions,
} from "./watchlist";
import {
  ensureNudgeAlarms,
  handleNudgeAlarm,
  handleNudgeNotificationClick,
  markFirstUse,
} from "./nudges";
import {
  buildIntegrationsView,
  generateAffiliateLink,
  maybeTestAllOnStartup,
  openaiComplete,
  saveIntegration,
  testAllIntegrations,
  testIntegration,
} from "./integrations";
import {
  bulkMintBranded,
  getOwnerPixels,
  listOwnerLinks,
  ownerStats,
  repointOwnerLink,
  saveOwnerPixels,
} from "./links";
import { API_BASE } from "../shared/constants";
import { getState, patchIntegrationsGlobal } from "../storage/store";
import type { AuthStatus, RuntimeMessage } from "../shared/messages";

// Background service worker: the only place that talks to
// influencerbutler.com. Receives findings from content scripts, queues them,
// and flushes on a steady alarm plus opportunistically on arrival.

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
  void chrome.alarms.create(CATALOGUE_ALARM, { periodInMinutes: CATALOGUE_PERIOD_MINUTES });
  void chrome.alarms.create(WATCHLIST_ALARM, { periodInMinutes: WATCHLIST_PERIOD_MINUTES });
  void refreshCatalogues();
  void refreshRateCard();
});

chrome.runtime.onStartup.addListener(() => {
  // Idempotent: re-arm the watchlist alarm for installs that predate it.
  void chrome.alarms.create(WATCHLIST_ALARM, { periodInMinutes: WATCHLIST_PERIOD_MINUTES });
  void refreshCatalogues();
  void refreshRateCard();
  void maybeTestAllOnStartup();
  // Re-arm the nudge alarms: a one-shot `when` that elapsed while the browser
  // was closed fires on the next launch.
  void ensureNudgeAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    void flush();
    // Reverse channel: pick up anything the paired app wants to show the creator.
    void pollAppNotifications();
  }
  if (alarm.name === CATALOGUE_ALARM) {
    void refreshCatalogues();
    void refreshRateCard();
  }
  if (alarm.name === WATCHLIST_ALARM) void refreshWatchlist();
  handleNudgeAlarm(alarm.name);
});

// A nudge notification was clicked: open its target and record that the user
// acted (so the matching in-page modal is suppressed).
chrome.notifications.onClicked.addListener((notificationId) => {
  // Watchlist alerts open the product directly; anything else is a nudge.
  if (handleWatchNotificationClick(notificationId)) return;
  void handleNudgeNotificationClick(notificationId, openAllowedUrl);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  // Instagram Goldmine (self-hosted build only). Gated behind the build flag so
  // the whole handler dead-code-eliminates out of the public build.
  if (IB_IG_ENABLED && handleInstagramMessage(message, sendResponse)) return true;
  switch (message.kind) {
    case "RECORD_FINDING":
      // When this finding came from a tab we opened for the order video-count
      // pass, feed its counts to that in-flight scan before queueing as usual.
      noteScanFinding(message.finding, sender.tab?.id);
      // Fold any product-scan price into the local price-history sparkline.
      void recordPriceFromFinding(message.finding);
      void enqueue(message.finding)
        .then(() => flush())
        .finally(() => sendResponse(undefined));
      return true;
    case "GET_AUTH_STATUS":
      void buildAuthStatus().then(sendResponse);
      return true;
    case "SIGN_IN":
      void signIn(message.licenseKey).then(sendResponse);
      return true;
    case "SIGN_OUT":
      void signOut().then(() => sendResponse(undefined));
      return true;
    case "FLUSH_QUEUE":
      void flush().then(() => sendResponse(undefined));
      return true;
    case "GET_HUD_STATUS":
      void getHudStatus(message.force).then(sendResponse);
      return true;
    case "SEND_HUD_COMMAND":
      void sendHudCommand(message.command).then(sendResponse);
      return true;
    case "LOOKUP_EARNINGS":
      void lookupEarnings(message.asins).then(sendResponse);
      return true;
    case "GET_PRICE_HISTORY":
      void getPriceHistory(message.asin, message.marketplace).then(sendResponse);
      return true;
    case "GET_DESKTOP_HISTORY":
      void fetchDesktopHistory(message.asin).then(sendResponse);
      return true;
    case "REQUEST_PAIRING":
      void requestPairing().then(sendResponse);
      return true;
    case "SUBMIT_PAIRING_CODE":
      void submitPairingCode(message.code).then(sendResponse);
      return true;
    case "UNPAIR_APP":
      void unpair().then(() => sendResponse(undefined));
      return true;
    case "SEND_FEEDBACK":
      void sendFeedback(message.feedback).then(sendResponse);
      return true;
    case "FETCH_MARKET_AVAILABILITY":
      void fetchMarketAvailability(message.asin, message.markets).then(sendResponse);
      return true;
    case "SCAN_ASIN_IN_TAB":
      void scanAsinInTab(message.asin, message.marketplace).then(sendResponse);
      return true;
    case "GET_ORDER_ASINS":
      void getOrderAsins().then(sendResponse);
      return true;
    case "ENRICH_PRODUCTS":
      void enrichProducts(message.asins, message.marketplaces).then(sendResponse);
      return true;
    case "ADD_TO_WATCHLIST":
      void addToWatchlist(message.item).then(sendResponse);
      return true;
    case "REMOVE_FROM_WATCHLIST":
      void removeFromWatchlist(message.asin, message.marketplace).then(sendResponse);
      return true;
    case "SET_WATCH_CONDITIONS":
      void setWatchConditions(message.asin, message.marketplace, message.notifyOn).then(sendResponse);
      return true;
    case "GET_WATCHLIST":
      void getWatchlist().then(sendResponse);
      return true;
    case "IS_WATCHED":
      void isWatched(message.asin, message.marketplace).then(sendResponse);
      return true;
    case "HARVEST_DEAL_SITES":
      void harvestDealSites(message.urls).then(sendResponse);
      return true;
    case "GET_DEAL_SOURCES":
      void getDealSources(message.force).then(sendResponse);
      return true;
    case "OPEN_URL":
      // Content-script anchors with target=_blank do not reliably open from
      // inside the overlay's shadow DOM, so open the tab here. Only our own
      // site plus the Facebook group are allowed, so a page can never drive
      // this to an arbitrary URL.
      void openAllowedUrl(message.url).then(() => sendResponse(undefined));
      return true;
    case "OPEN_OPTIONS":
      void chrome.runtime.openOptionsPage(() => sendResponse(undefined));
      return true;
    case "MARK_FIRST_USE":
      void markFirstUse().then(() => sendResponse(undefined));
      return true;
    case "GET_INTEGRATIONS":
      void buildIntegrationsView().then(sendResponse);
      return true;
    case "SAVE_INTEGRATION":
      void saveIntegration(
        message.id,
        message.values,
        message.enabled,
        message.routingParticipates,
      ).then(sendResponse);
      return true;
    case "SET_INTEGRATION_GLOBAL":
      void patchIntegrationsGlobal(message.partial).then(sendResponse);
      return true;
    case "TEST_INTEGRATION":
      void testIntegration(message.id).then(sendResponse);
      return true;
    case "TEST_ALL_INTEGRATIONS":
      void testAllIntegrations().then(sendResponse);
      return true;
    case "GENERATE_AFFILIATE_LINK":
      void generateAffiliateLink(message.asin, message.marketplace, message.url).then(sendResponse);
      return true;
    case "REWRITE_LINK":
      void rewriteLink(message.url).then(sendResponse);
      return true;
    case "OPENAI_COMPLETE":
      void openaiComplete(message.prompt).then(sendResponse);
      return true;
    case "LINK_MINT_BULK":
      void bulkMintBranded(message.targets).then(sendResponse);
      return true;
    case "LINK_STATS":
      void ownerStats(message.range, { slug: message.slug, traffic: message.traffic }).then(sendResponse);
      return true;
    case "LINK_LIST":
      void listOwnerLinks(message.cursor).then(sendResponse);
      return true;
    case "LINK_REPOINT":
      void repointOwnerLink({
        slug: message.slug,
        url: message.url,
        asin: message.asin,
        marketplace: message.marketplace,
      }).then(sendResponse);
      return true;
    case "LINK_PIXELS_GET":
      void getOwnerPixels().then(sendResponse);
      return true;
    case "LINK_PIXELS_SAVE":
      void saveOwnerPixels(message.pixels).then(sendResponse);
      return true;
    case "GET_PAGE_STATUS":
      return false; // answered by content scripts, not the background
  }
});

// Rewrite an existing Amazon product url through affiliate routing. This is the
// automatic path, so it only rewrites when the global toggle is on; otherwise
// it returns the url untouched. Extracts the ASIN and marketplace from the url.
async function rewriteLink(url: string): Promise<import("../shared/messages").GenerateLinkResult> {
  try {
    const state = await getState();
    if (!state.integrations.global.affiliateRoutingEnabled) return { ok: true, url };
    const parsed = new URL(url);
    const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(parsed.pathname)?.[1] ?? "";
    const marketplace = parsed.hostname.replace(/^www\./, "");
    return await generateAffiliateLink(asin, marketplace, url);
  } catch {
    return { ok: false, error: "That is not a valid product URL." };
  }
}

async function openAllowedUrl(url: string): Promise<void> {
  try {
    const target = new URL(url, API_BASE);
    const sameOrigin = target.origin === new URL(API_BASE).origin;
    // The nudges also need to open the Facebook group, which is off our origin.
    // Allow that one exact destination, nothing else, so the "no arbitrary URL"
    // guarantee holds.
    const isFacebookGroup = target.href === FACEBOOK_GROUP_URL;
    if (!sameOrigin && !isFacebookGroup) return;
    await chrome.tabs.create({ url: target.toString() });
  } catch {
    // malformed url: ignore rather than open anything
  }
}

async function buildAuthStatus(): Promise<AuthStatus> {
  const [{ signedIn, email }, depth, state] = await Promise.all([
    authSnapshot(),
    queueDepth(),
    getState(),
  ]);
  return { signedIn, email, queueDepth: depth, lastSyncAt: state.lastSyncAt };
}
