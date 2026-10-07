import { AUTO_ACCEPT_TAB_DWELL_MS, CAMPAIGN_GRID_URL } from "../shared/constants";
import { getFlags } from "../flags/cache";
import { getState } from "../storage/store";
import { log } from "../shared/log";
import { t } from "../i18n";
import type { AutoAcceptedItem, AutoAcceptStopReason } from "../shared/messages";
import {
  cooldownActive,
  loadCooldown,
  noteAccepts,
  runInAcceptQueue,
  startCooldown,
} from "./campaign-accept";
import { contentLinkEnabled, runLinkPass } from "./content-link";

// Auto-accept: the background half of "accept campaigns that match my rules".
//
// Every CAMPAIGN_WATCH_ALARM tick (30 min, after the Last Call poll) this opens
// the Creator Connections grid in ONE inactive tab, waits for that tab's content
// script to report ACCEPT_TAB_READY, and asks it to run the creator's rules
// (RUN_AUTO_ACCEPT -> tools/campaign-radar/auto-accept.ts). The tab clicks
// Amazon's OWN Accept button on each pick, human-paced, and answers with
// AUTO_ACCEPT_DONE; we then record the ledger, start the robot-check cooldown
// when Amazon blocked us, and post ONE summary notification.
//
// Everything is opt-in (settings.autoAccept.enabled), capped (daily + per run),
// remotely killable ("autoAccept" in the flags disabledTools) and serialized with
// every other accept tab through runInAcceptQueue, so a manual accept and an
// auto pass never drive two tabs at once.

export type AutoAcceptDone = {
  accepted: AutoAcceptedItem[];
  stoppedReason: AutoAcceptStopReason | null;
};

type Pending = {
  started: boolean;
  done: boolean;
  timer: ReturnType<typeof setTimeout>;
  resolve: (result: AutoAcceptDone | null) => void;
};

// Keyed by the tab we opened, so ACCEPT_TAB_READY / AUTO_ACCEPT_DONE from any
// other campaign tab the creator has open are ignored.
const pendingByTab = new Map<number, Pending>();
let running = false;

// Pure-ish gate shared with the content side: the creator's switch, the tool
// toggle, and the remote kill switch (this worker path reads storage directly,
// so it must honor the flag itself).
export async function autoAcceptEnabled(): Promise<boolean> {
  const state = await getState();
  if (!state.settings.tools.autoAccept || !state.settings.autoAccept.enabled) return false;
  const flags = await getFlags();
  if (flags?.disableAll) return false;
  if (flags?.disabledTools.includes("autoAccept")) return false;
  return true;
}

// One pass. Safe to call on every alarm tick: it no-ops when Auto mode is off, a
// cooldown is in force, or a pass is already running.
export async function runAutoAcceptPass(): Promise<void> {
  if (running) return;
  if (!(await autoAcceptEnabled())) return;
  if (cooldownActive(await loadCooldown(), Date.now())) return;

  running = true;
  try {
    const result = await runInAcceptQueue(() => driveGridTab());
    if (result) await handleResult(result);
    await maybeSubmitLinks();
  } catch (error) {
    log("auto-accept", "pass failed", error);
  } finally {
    running = false;
  }
}

async function handleResult(result: AutoAcceptDone): Promise<void> {
  if (result.accepted.length > 0) {
    await noteAccepts(
      result.accepted.map((item) => ({ campaignId: item.campaignId, asin: item.asin ?? null })),
      "auto",
    );
    notify(
      t().autoAcceptNotifTitle,
      t().autoAcceptNotifBody(
        result.accepted.length,
        result.accepted.map((item) => item.brand ?? t().lastCallCampaignFallback).join(", "),
      ),
    );
  }
  if (result.stoppedReason === "blocked") {
    await startCooldown(Date.now());
    notify(t().autoAcceptNotifTitle, t().autoAcceptNotifPaused);
  }
}

// After the accepts: submit the creator's storefront link for the accepted
 // campaigns still waiting for one (including ones accepted in earlier passes),
// when the creator asked for it. Skipped while a robot-check cooldown is on.
async function maybeSubmitLinks(): Promise<void> {
  const state = await getState();
  if (!state.settings.autoAccept.submitLinks) return;
  if (!(await contentLinkEnabled())) return;
  if (cooldownActive(await loadCooldown(), Date.now())) return;
  try {
    await runLinkPass();
  } catch (error) {
    log("auto-accept", "link pass failed", error);
  }
}

function notify(title: string, message: string): void {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title,
      message,
    });
  } catch (error) {
    log("auto-accept", "could not create notification", error);
  }
}

// Open the grid inactive, wait for the content script, close the tab. Resolves
// null when nothing reported inside the dwell (a signed-out grid never arms the
// runner: the fail-closed path) so no ledger entry is ever invented.
function driveGridTab(): Promise<AutoAcceptDone | null> {
  return chrome.tabs
    .create({ url: CAMPAIGN_GRID_URL, active: false })
    .then((tab) => {
      const tabId = tab.id;
      if (typeof tabId !== "number") return null;
      return new Promise<AutoAcceptDone | null>((resolve) => {
        const timer = setTimeout(() => finish(tabId, null), AUTO_ACCEPT_TAB_DWELL_MS);
        pendingByTab.set(tabId, { started: false, done: false, timer, resolve });
      });
    })
    .catch((error) => {
      log("auto-accept", "could not open grid tab", error);
      return null;
    });
}

// ACCEPT_TAB_READY from a tab: if it is our auto tab and not yet started, ask it
// to run the rules. A tab we did not open is ignored.
export function noteAutoAcceptTabReady(tabId: number | undefined): void {
  if (typeof tabId !== "number") return;
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done || pending.started) return;
  pending.started = true;
  void chrome.tabs.sendMessage(tabId, { kind: "RUN_AUTO_ACCEPT" }).catch((error) => {
    log("auto-accept", "RUN_AUTO_ACCEPT send failed", error);
    finish(tabId, null);
  });
}

// AUTO_ACCEPT_DONE from a tab: resolve the pass that opened it.
export function noteAutoAcceptDone(tabId: number | undefined, result: AutoAcceptDone): void {
  if (typeof tabId !== "number") return;
  finish(tabId, result);
}

function finish(tabId: number, result: AutoAcceptDone | null): void {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  pendingByTab.delete(tabId);
  clearTimeout(pending.timer);
  void chrome.tabs.remove(tabId).catch(() => {
    // tab may already be gone (user closed it)
  });
  pending.resolve(result);
}

// A creator closing our tab mid-run must not hold the queue until the dwell ends.
try {
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    if (pendingByTab.has(tabId)) finish(tabId, null);
  });
} catch {
  // chrome.tabs unavailable (tests); the dwell timer still bounds every run
}
