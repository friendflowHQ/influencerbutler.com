import { ACCEPT_TAB_DWELL_MS } from "../shared/constants";
import { getFlags } from "../flags/cache";
import { getState } from "../storage/store";
import { log } from "../shared/log";
import { t } from "../i18n";
import type {
  LinkOneResult,
  LinkPassResult,
  LinkStatusResult,
} from "../shared/messages";
import {
  LINK_LEDGER_KEY,
  LINK_PASS_CAP,
  detectContentType,
  pendingLinks,
  readLinkLedger,
  recordLinkAttempt,
  type LinkLedger,
  type LinkStatus,
} from "../tools/campaign-radar/content-link";
import type { FindActiveResult, SubmitLinkOutcome } from "../tools/campaign-radar/content-link-runner";
import { loadStorefrontIndex } from "../storefront/index-store";
import {
  acceptedCcAsins,
  cooldownActive,
  loadAcceptLedger,
  loadCooldown,
  runInAcceptQueue,
  startCooldown,
} from "./campaign-accept";

// Content-link submit: the background half. For one ASIN it opens the requests
// grid's ACTIVE tab filtered to that ASIN, asks the tab to pick the best active
// campaign (RUN_LINK_FIND), navigates the same tab to that campaign's detail page,
// and asks it to type the creator's own storefront video URL into Amazon's
// content form and press Submit (RUN_LINK_SUBMIT). Both steps are answered in the
// reply to chrome.tabs.sendMessage; the tab announces each page with
// ACCEPT_TAB_READY (the same handshake the accept tabs use).
//
// Serialized with every other accept tab (runInAcceptQueue), capped per pass,
// remotely killable ("contentLinkSubmit" in the flags disabledTools), and it shares
// the robot-check cooldown: a blocked page pauses accepts AND link submits.

const ASIN_RE = /^[A-Z0-9]{10}$/;
const READY_TIMEOUT_MS = 25_000;
const STEP_TIMEOUT_MS = ACCEPT_TAB_DWELL_MS + 15_000;
// A human-paced gap between two ASINs in one pass (jittered).
const GAP_MIN_MS = 1_500;
const GAP_MAX_MS = 2_200;

// The Active tab of the requests grid, filtered to one ASIN. type=affiliate-plus
// is load-bearing (the bare URL lands on the SPCC tab); the status= param does not
// select the tab, the runner clicks it.
export const activeUrlForAsin = (asin: string): string =>
  `https://affiliate-program.amazon.com/p/connect/requests?status=active&type=affiliate-plus&keyword=${encodeURIComponent(asin)}`;

type PageType = "campaign-grid" | "campaign-detail";
const waiters = new Map<number, (pageType: PageType) => void>();

// ACCEPT_TAB_READY from a tab: resolves the step waiting on that tab, if any.
export function noteLinkTabReady(tabId: number | undefined, pageType: PageType): void {
  if (typeof tabId !== "number") return;
  const resolve = waiters.get(tabId);
  if (!resolve) return;
  waiters.delete(tabId);
  resolve(pageType);
}

// Resolves true when the tab's content script announces itself. Either page type
// counts: the campaign's "View Details" link may land on the singular detail page
// or on a grid route, and the runner itself checks for the content form.
function waitReady(tabId: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(tabId);
      resolve(false);
    }, READY_TIMEOUT_MS);
    waiters.set(tabId, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function sendWithTimeout<T>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), STEP_TIMEOUT_MS);
    chrome.tabs
      .sendMessage(tabId, message)
      .then((reply: T) => {
        clearTimeout(timer);
        resolve(reply ?? null);
      })
      .catch((error) => {
        clearTimeout(timer);
        log("content-link", "tab message failed", error);
        resolve(null);
      });
  });
}

// ---- Gates and storage -------------------------------------------------------

export async function contentLinkEnabled(): Promise<boolean> {
  const state = await getState();
  if (!state.settings.tools.contentLinkSubmit) return false;
  const flags = await getFlags();
  if (flags?.disableAll) return false;
  if (flags?.disabledTools.includes("contentLinkSubmit")) return false;
  return true;
}

async function loadLinkLedger(): Promise<LinkLedger> {
  const raw = await chrome.storage.local.get(LINK_LEDGER_KEY);
  return readLinkLedger(raw[LINK_LEDGER_KEY]);
}

async function noteLink(asin: string, status: LinkStatus, url: string): Promise<void> {
  const next = recordLinkAttempt(await loadLinkLedger(), asin, status, url, Date.now());
  await chrome.storage.local.set({ [LINK_LEDGER_KEY]: next });
}

// What the Storefront Check panel and the product page show: is there a video of
// the creator's for this ASIN, was its link already submitted, and how many
// accepted campaigns are still waiting for a link.
export async function getLinkStatus(asin?: string): Promise<LinkStatusResult> {
  const index = await loadStorefrontIndex();
  const ledger = await loadLinkLedger();
  const accepted = acceptedCcAsins((await loadAcceptLedger()).history);
  const now = Date.now();
  const key = asin?.trim().toUpperCase() ?? "";
  const video = key && index ? index.byAsin[key] : undefined;
  return {
    hasIndex: !!index,
    storefrontCount: index ? Object.keys(index.byAsin).length : 0,
    hasVideo: !!video,
    url: video?.url ?? null,
    submitted: !!(video && ledger[key]?.status === "submitted" && ledger[key]?.url === video.url),
    pending: index ? pendingLinks(accepted, index.byAsin, ledger, now).length : 0,
  };
}

// ---- One ASIN --------------------------------------------------------------------

// Submit the creator's storefront video as the content link for one ASIN's best
// active campaign. NOT queued itself: callers wrap it in runInAcceptQueue.
async function submitLinkForAsin(asin: string, url: string): Promise<LinkOneResult> {
  if (!(await contentLinkEnabled())) return { ok: false, reason: "disabled" };
  if (cooldownActive(await loadCooldown(), Date.now())) return { ok: false, reason: "cooldown" };

  let tabId: number | null = null;
  try {
    const gridReady = openTab(activeUrlForAsin(asin));
    tabId = await gridReady.tabId;
    if (tabId === null) return { ok: false, reason: "tab" };
    if (!(await gridReady.ready)) return { ok: false, reason: "timeout" };

    const found = await sendWithTimeout<FindActiveResult>(tabId, { kind: "RUN_LINK_FIND", asin });
    if (!found) return { ok: false, reason: "timeout" };
    if (!found.ok) return finishFail(asin, url, found.reason);

    // The detail page: navigate the same tab, then wait for ITS content script.
    const detailReady = waitReady(tabId);
    try {
      await chrome.tabs.update(tabId, { url: found.href });
    } catch (error) {
      log("content-link", "could not navigate to the campaign", error);
      return { ok: false, reason: "tab" };
    }
    if (!(await detailReady)) return finishFail(asin, url, "timeout");

    const done = await sendWithTimeout<SubmitLinkOutcome>(tabId, {
      kind: "RUN_LINK_SUBMIT",
      url,
      contentType: detectContentType(url),
    });
    if (!done) return finishFail(asin, url, "timeout");
    if (!done.ok) return finishFail(asin, url, done.reason);
    await noteLink(asin, "submitted", url);
    return { ok: true, state: done.state };
  } finally {
    if (tabId !== null) {
      waiters.delete(tabId);
      void chrome.tabs.remove(tabId).catch(() => {
        // tab may already be gone (user closed it)
      });
    }
  }
}

// Open `url` inactive and arm the READY waiter before the page can announce.
function openTab(url: string): { tabId: Promise<number | null>; ready: Promise<boolean> } {
  let resolveTab!: (id: number | null) => void;
  const tabId = new Promise<number | null>((r) => (resolveTab = r));
  const ready = chrome.tabs
    .create({ url, active: false })
    .then((tab) => {
      const id = typeof tab.id === "number" ? tab.id : null;
      resolveTab(id);
      return id === null ? false : waitReady(id);
    })
    .catch((error) => {
      log("content-link", "could not open tab", error);
      resolveTab(null);
      return false;
    });
  return { tabId, ready };
}

// Why a step of the flow failed, as the tab (or the worker's own timers) report.
type StepFailReason =
  | "blocked"
  | "not-found"
  | "no-campaign"
  | "form"
  | "no-confirm"
  | "timeout"
  | "error";

async function finishFail(asin: string, url: string, reason: StepFailReason): Promise<LinkOneResult> {
  if (reason === "blocked") {
    await startCooldown(Date.now());
    return { ok: false, reason: "blocked" };
  }
  // No active campaign yet (a brand that approves manually leaves it pending):
  // recheck later rather than counting a failure.
  if (reason === "no-campaign") {
    await noteLink(asin, "no-campaign", url);
    return { ok: false, reason: "no-campaign" };
  }
  await noteLink(asin, "failed", url);
  return { ok: false, reason };
}

// ---- Entry points ----------------------------------------------------------------

// One-off: the product-page button. The URL comes from the creator's own
// storefront index, never from the page.
export function submitLinkOne(asinRaw: string): Promise<LinkOneResult> {
  const asin = asinRaw.trim().toUpperCase();
  if (!ASIN_RE.test(asin)) return Promise.resolve({ ok: false, reason: "error" });
  return runInAcceptQueue(async () => {
    const index = await loadStorefrontIndex();
    const video = index?.byAsin[asin];
    if (!video) return { ok: false, reason: "no-video" } as LinkOneResult;
    return submitLinkForAsin(asin, video.url);
  });
}

// A pass over the accepted CC campaigns still waiting for a link (the Auto pass
// and the Storefront Check button). Each ASIN is its own queue slot so a manual
// accept can interleave; stops on the first blocked / cooldown / disabled.
export async function runLinkPass(max: number = LINK_PASS_CAP, notify = true): Promise<LinkPassResult> {
  const out: LinkPassResult = { attempted: 0, submitted: 0, stoppedReason: null, remaining: 0 };
  if (!(await contentLinkEnabled())) return { ...out, stoppedReason: "disabled" };
  const index = await loadStorefrontIndex();
  if (!index) return { ...out, stoppedReason: "no-video" };

  const accepted = acceptedCcAsins((await loadAcceptLedger()).history);
  const todo = pendingLinks(accepted, index.byAsin, await loadLinkLedger(), Date.now());
  const batch = todo.slice(0, Math.max(0, max));
  out.remaining = todo.length - batch.length;

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    if (!item) continue;
    if (i > 0) await sleep(GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS));
    const result = await runInAcceptQueue(() => submitLinkForAsin(item.asin, item.url));
    out.attempted += 1;
    if (result.ok) {
      out.submitted += 1;
      continue;
    }
    if (result.reason === "blocked" || result.reason === "cooldown" || result.reason === "disabled") {
      out.stoppedReason = result.reason;
      out.remaining += batch.length - i - 1;
      break;
    }
  }

  if (notify && out.submitted > 0) {
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: t().autoAcceptNotifTitle,
        message: t().linkNotifBody(out.submitted),
      });
    } catch (error) {
      log("content-link", "could not create notification", error);
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
