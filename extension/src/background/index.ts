import {
  CATALOGUE_ALARM,
  CATALOGUE_PERIOD_MINUTES,
  SYNC_ALARM,
  SYNC_PERIOD_MINUTES,
} from "../shared/constants";
import { enqueue, flush, queueDepth } from "../transport/router";
import { authSnapshot, signIn, signOut } from "./auth";
import { getHudStatus, sendHudCommand } from "./hud-bridge";
import { sendFeedback } from "./feedback";
import { refreshCatalogues } from "./catalogue";
import { refreshRateCard } from "./rate-card";
import { API_BASE } from "../shared/constants";
import { getState } from "../storage/store";
import type { AuthStatus, RuntimeMessage } from "../shared/messages";

// Background service worker: the only place that talks to
// influencerbutler.com. Receives findings from content scripts, queues them,
// and flushes on a steady alarm plus opportunistically on arrival.

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
  void chrome.alarms.create(CATALOGUE_ALARM, { periodInMinutes: CATALOGUE_PERIOD_MINUTES });
  void refreshCatalogues();
  void refreshRateCard();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshCatalogues();
  void refreshRateCard();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void flush();
  if (alarm.name === CATALOGUE_ALARM) {
    void refreshCatalogues();
    void refreshRateCard();
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  switch (message.kind) {
    case "RECORD_FINDING":
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
    case "SEND_FEEDBACK":
      void sendFeedback(message.feedback).then(sendResponse);
      return true;
    case "OPEN_URL":
      // Content-script anchors with target=_blank do not reliably open from
      // inside the overlay's shadow DOM, so open the tab here. Only our own
      // site is allowed, so a page can never drive this to an arbitrary URL.
      void openOurUrl(message.url).then(() => sendResponse(undefined));
      return true;
    case "GET_PAGE_STATUS":
      return false; // answered by content scripts, not the background
  }
});

async function openOurUrl(url: string): Promise<void> {
  try {
    const target = new URL(url, API_BASE);
    if (target.origin !== new URL(API_BASE).origin) return;
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
