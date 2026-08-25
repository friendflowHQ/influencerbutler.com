import {
  CAMPAIGN_WATCH_ALARM,
  CAMPAIGN_WATCH_PERIOD_MINUTES,
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
import { getHudStatus, sendHudCommand, lookupEarnings, fetchDesktopHistory, fetchOutreachKeywords, requestPairing, submitPairingCode, unpair } from "./hud-bridge";
import { sendFeedback } from "./feedback";
import { refreshCatalogues } from "./catalogue";
import { refreshRateCard, refreshWalmartRateCard } from "./rate-card";
import { refreshFlags } from "./flags";
import { fetchMarketAvailability } from "./market-availability";
import { enrichProducts } from "./enrich";
import { lookupCcRates } from "./cc-rates";
import { enrichRows } from "./row-enrich";
import { getMarket, getMarketBatch } from "./market";
import { getVideoIntel } from "./video-intel";
import { fetchCampaignBrief } from "./campaign-brief";
import {
  assistantChat,
  assistantVoiceSession,
  assistantVoiceTool,
  assistantVoiceTranscript,
} from "./assistant";
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
  addManyToProductList,
  addToProductList,
  createProductList,
  deleteProductList,
  getProductLists,
  removeFromProductList,
  renameProductList,
} from "./product-lists";
import {
  addCampaignWatch,
  getCampaignWatchList,
  handleCampaignFills,
  handleLastCallNotificationClick,
  refreshLastCall,
  removeCampaignWatch,
} from "./last-call";
import {
  ensureNudgeAlarms,
  handleNudgeAlarm,
  handleNudgeNotificationClick,
  markFirstUse,
} from "./nudges";
import {
  applyUpdate,
  checkForUpdate,
  getUpdateStateView,
  noteUpdateAvailable,
  remindUpdateLater,
} from "./update";
import {
  buildIntegrationsView,
  generateAffiliateLink,
  clearIntegration,
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
  void chrome.alarms.create(CAMPAIGN_WATCH_ALARM, {
    periodInMinutes: CAMPAIGN_WATCH_PERIOD_MINUTES,
  });
  void refreshCatalogues();
  void refreshRateCard();
  void refreshWalmartRateCard();
  void refreshFlags();
  // After an update applies, this drops the now-stale "update waiting" record.
  void getUpdateStateView();
});

chrome.runtime.onStartup.addListener(() => {
  // Idempotent: re-arm the watchlist alarm for installs that predate it.
  void chrome.alarms.create(WATCHLIST_ALARM, { periodInMinutes: WATCHLIST_PERIOD_MINUTES });
  void chrome.alarms.create(CAMPAIGN_WATCH_ALARM, {
    periodInMinutes: CAMPAIGN_WATCH_PERIOD_MINUTES,
  });
  void refreshCatalogues();
  void refreshRateCard();
  void refreshWalmartRateCard();
  void refreshFlags();
  void maybeTestAllOnStartup();
  // Re-arm the nudge alarms: a one-shot `when` that elapsed while the browser
  // was closed fires on the next launch.
  void ensureNudgeAlarms();
  // A browser restart applies any staged update; clear the stale record.
  void getUpdateStateView();
});

// Chrome fires this when it has downloaded a new extension version. In MV3 it
// still applies the update on its own once this worker idles (the listener does
// not defer it); we record it so the banner and popup can tell the user.
chrome.runtime.onUpdateAvailable.addListener((details) => {
  void noteUpdateAvailable(details.version);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    void flush();
    // Reverse channel: pick up anything the paired app wants to show the creator.
    void pollAppNotifications();
    // Operational flags ride the frequent sync alarm (self-throttled to one
    // fetch per stale window) so a remote kill switch reaches the browser in
    // minutes, not on the daily catalogue cadence.
    void refreshFlags();
  }
  if (alarm.name === CATALOGUE_ALARM) {
    void refreshCatalogues();
    void refreshRateCard();
    void refreshWalmartRateCard();
    // Nudge Chrome's updater on the same cadence; it staging a new version
    // fires onUpdateAvailable above. No-op on unpacked installs.
    void checkForUpdate();
  }
  if (alarm.name === WATCHLIST_ALARM) void refreshWatchlist();
  if (alarm.name === CAMPAIGN_WATCH_ALARM) void refreshLastCall();
  handleNudgeAlarm(alarm.name);
});

// A nudge notification was clicked: open its target and record that the user
// acted (so the matching in-page modal is suppressed).
chrome.notifications.onClicked.addListener((notificationId) => {
  // Watchlist alerts open the product directly; Last Call alerts open the
  // campaign grid; anything else is a nudge.
  if (handleWatchNotificationClick(notificationId)) return;
  if (handleLastCallNotificationClick(notificationId)) return;
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
    case "AI_CHAT":
      void assistantChat(message.messages).then(sendResponse);
      return true;
    case "VOICE_SESSION":
      void assistantVoiceSession().then(sendResponse);
      return true;
    case "VOICE_TOOL":
      void assistantVoiceTool(message.name, message.args).then(sendResponse);
      return true;
    case "VOICE_TRANSCRIPT":
      void assistantVoiceTranscript(message.sessionId, message.transcript, message.startedAt).then(sendResponse);
      return true;
    case "GET_PRICE_HISTORY":
      void getPriceHistory(message.asin, message.marketplace).then(sendResponse);
      return true;
    case "GET_DESKTOP_HISTORY":
      void fetchDesktopHistory(message.asin).then(sendResponse);
      return true;
    case "FETCH_OUTREACH_KEYWORDS":
      void fetchOutreachKeywords().then(sendResponse);
      return true;
    case "GET_MARKET":
      void getMarket(message.asin, message.marketplace, message.retailer).then(sendResponse);
      return true;
    case "GET_MARKET_BATCH":
      void getMarketBatch(message.asins, message.marketplace, message.retailer).then(sendResponse);
      return true;
    case "GET_VIDEO_INTEL":
      void getVideoIntel(message.videoId, message.marketplace).then(sendResponse);
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
    case "LOOKUP_CC_RATES":
      void lookupCcRates(message.asins).then(sendResponse);
      return true;
    case "ENRICH_ROWS":
      void enrichRows(message.refs).then(sendResponse);
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
    case "GET_PRODUCT_LISTS":
      void getProductLists().then(sendResponse);
      return true;
    case "CREATE_PRODUCT_LIST":
      void createProductList(message.name).then(sendResponse);
      return true;
    case "RENAME_PRODUCT_LIST":
      void renameProductList(message.id, message.name).then(sendResponse);
      return true;
    case "DELETE_PRODUCT_LIST":
      void deleteProductList(message.id).then(sendResponse);
      return true;
    case "ADD_TO_PRODUCT_LIST":
      void addToProductList({
        listId: message.listId,
        newListName: message.newListName,
        item: message.item,
      }).then(sendResponse);
      return true;
    case "ADD_MANY_TO_PRODUCT_LIST":
      void addManyToProductList({
        listId: message.listId,
        newListName: message.newListName,
        items: message.items,
      }).then(sendResponse);
      return true;
    case "REMOVE_FROM_PRODUCT_LIST":
      void removeFromProductList(message.listId, message.asin, message.marketplace).then(
        sendResponse,
      );
      return true;
    case "CAMPAIGN_WATCH_ADD":
      void addCampaignWatch(message.item).then(sendResponse);
      return true;
    case "CAMPAIGN_WATCH_REMOVE":
      void removeCampaignWatch(message.campaignId).then(sendResponse);
      return true;
    case "CAMPAIGN_WATCH_LIST":
      void getCampaignWatchList().then(sendResponse);
      return true;
    case "REPORT_CAMPAIGN_FILLS":
      void handleCampaignFills(message.fills, sender.tab?.id).then(() => sendResponse(undefined));
      return true;
    case "GET_CAMPAIGN_BRIEF":
      void fetchCampaignBrief(message.signals).then(sendResponse);
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
    case "CLEAR_INTEGRATION":
      void clearIntegration(message.id).then(sendResponse);
      return true;
    case "TEST_INTEGRATION":
      void testIntegration(message.id).then(sendResponse);
      return true;
    case "TEST_ALL_INTEGRATIONS":
      void testAllIntegrations().then(sendResponse);
      return true;
    case "GENERATE_AFFILIATE_LINK":
      void generateAffiliateLink(message.asin, message.marketplace, message.url, message.retailer).then(
        sendResponse,
      );
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
    case "GET_UPDATE_STATE":
      void getUpdateStateView().then(sendResponse);
      return true;
    case "UPDATE_REMIND_LATER":
      void remindUpdateLater().then(() => sendResponse(undefined));
      return true;
    case "APPLY_UPDATE":
      // Respond before reloading: reload() kills this worker immediately, so a
      // response sent after it would never arrive.
      sendResponse(undefined);
      applyUpdate();
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
