import { getState, patchState } from "../storage/store";
import { log } from "../shared/log";
import { CAMPAIGN_GRID_URL } from "../shared/constants";
import { CAMPAIGN_WATCHLIST_CAP, type CampaignWatchItem } from "../storage/schema";
import { campaignFillPct } from "../tools/campaign-radar/score";
import { t } from "../i18n";
import type { CampaignFill } from "../amazon/creator-campaigns";
import type { CampaignWatchInput, CampaignWatchListResult } from "../shared/messages";

// Last Call Butler: the campaign watchlist store ops plus the fill evaluator and
// its background poll.
//
// The creator taps the bell on a Creator Connections campaign card to have the
// Butler watch it. Fill data (creator slots claimed vs. cap) is not in the card
// DOM: the MAIN-world connect-hook captures it from the campaign/search API and
// the grid content script forwards it here via REPORT_CAMPAIGN_FILLS. We
// evaluate every watched campaign against the user's fill threshold on that one
// path, so a watch is checked both when the creator browses the grid themselves
// AND when the CAMPAIGN_WATCH_ALARM opens the grid in a background tab. A watched
// campaign crossing the threshold (or flipping to fully claimed) fires exactly
// one "Last Call" notification, so the creator can accept before it closes.

const NOTIF_PREFIX = "ib-lastcall:";
// How long to keep the poll's background grid tab open, waiting for its content
// script to report the captured fills, before giving up and closing it. The
// grid is a React SPA that fetches campaign/search shortly after load.
const POLL_DWELL_MS = 20_000;

const clampPct = (n: number): number => Math.min(100, Math.max(1, Math.round(n)));

// ---- Store ops --------------------------------------------------------------

const idsOf = (items: CampaignWatchItem[]): string[] => items.map((w) => w.campaignId);

export async function getCampaignWatchList(): Promise<CampaignWatchListResult> {
  return { campaignIds: idsOf((await getState()).campaignWatchlist) };
}

export async function addCampaignWatch(
  input: CampaignWatchInput,
): Promise<CampaignWatchListResult> {
  const campaignId = input.campaignId;
  if (!/^amzn1\.campaign\.[A-Za-z0-9]+$/.test(campaignId)) return getCampaignWatchList();
  let atCap = false;
  const state = await patchState((s) => {
    if (s.campaignWatchlist.some((w) => w.campaignId === campaignId)) return; // already watching
    if (s.campaignWatchlist.length >= CAMPAIGN_WATCHLIST_CAP) {
      atCap = true;
      return;
    }
    s.campaignWatchlist.push({
      campaignId,
      brand: input.brand,
      addedAt: Date.now(),
      lastFillPct: null,
      lastFullyClaimed: null,
      notifiedAt: null,
    });
  });
  return { campaignIds: idsOf(state.campaignWatchlist), atCap };
}

export async function removeCampaignWatch(campaignId: string): Promise<CampaignWatchListResult> {
  const state = await patchState((s) => {
    const idx = s.campaignWatchlist.findIndex((w) => w.campaignId === campaignId);
    if (idx >= 0) s.campaignWatchlist.splice(idx, 1);
  });
  return { campaignIds: idsOf(state.campaignWatchlist) };
}

// ---- Fill evaluation (shared by passive browsing and the poll) --------------

type FireKind = "near" | "filled";

// Evaluate a captured { campaignId -> fill } map against the watchlist and fire a
// Last Call notification for any watched campaign that first crosses the user's
// fill threshold (near full, still open) or first flips to fully claimed. Called
// for every grid capture; `tabId` (when present) is the background poll's tab, so
// it can be closed as soon as its report lands.
export async function handleCampaignFills(
  fills: Record<string, CampaignFill>,
  tabId?: number,
): Promise<void> {
  if (typeof tabId === "number") resolvePoll(tabId);

  const state = await getState();
  if (!state.settings.tools.lastCallButler || state.campaignWatchlist.length === 0) return;
  const threshold = clampPct(state.settings.lastCall.alertAtPct) / 100;

  const toFire: Array<{ campaignId: string; brand: string | null; kind: FireKind; pct: number | null }> =
    [];
  await patchState((s) => {
    for (const item of s.campaignWatchlist) {
      const fill = fills[item.campaignId];
      if (!fill) continue;
      const pct = campaignFillPct(fill.accepted, fill.required);
      const full = fill.fullyClaimed === true;
      // Record the latest observation regardless, for the popup/list to show.
      item.lastFillPct = pct;
      item.lastFullyClaimed = fill.fullyClaimed;
      if (item.notifiedAt !== null) continue; // already alerted once for this watch
      if (!full && pct !== null && pct >= threshold) {
        item.notifiedAt = Date.now();
        toFire.push({ campaignId: item.campaignId, brand: item.brand, kind: "near", pct });
      } else if (full) {
        item.notifiedAt = Date.now();
        toFire.push({ campaignId: item.campaignId, brand: item.brand, kind: "filled", pct });
      }
    }
  });

  for (const f of toFire) notify(f.campaignId, f.brand, f.kind, f.pct);
}

function notify(
  campaignId: string,
  brand: string | null,
  kind: FireKind,
  pct: number | null,
): void {
  const name = brand ?? t().lastCallCampaignFallback;
  const message =
    kind === "near"
      ? t().lastCallNotifNearFull(name, pct === null ? 0 : Math.round(pct * 100))
      : t().lastCallNotifFilled(name);
  try {
    chrome.notifications.create(`${NOTIF_PREFIX}${campaignId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: t().lastCallNotifTitle,
      message,
    });
  } catch (error) {
    log("last-call", "could not create notification", error);
  }
}

// A Last Call notification was clicked: open the campaign grid so the creator can
// accept. The URL is a fixed constant, never derived from page content.
export function handleLastCallNotificationClick(notificationId: string): boolean {
  if (!notificationId.startsWith(NOTIF_PREFIX)) return false;
  void chrome.tabs.create({ url: CAMPAIGN_GRID_URL });
  return true;
}

// ---- Background poll --------------------------------------------------------

const pollTabs = new Map<number, { timer: ReturnType<typeof setTimeout>; resolve: () => void }>();

function resolvePoll(tabId: number): void {
  const pending = pollTabs.get(tabId);
  if (!pending) return;
  pollTabs.delete(tabId);
  clearTimeout(pending.timer);
  void chrome.tabs.remove(tabId).catch(() => {
    // tab may already be gone
  });
  pending.resolve();
}

// Alarm handler: if the creator is watching any campaign, open the grid in one
// background tab so the connect-hook re-captures fills; handleCampaignFills does
// the diff and alerting when the tab reports. A logged-out or ineligible grid
// never fetches campaign/search, so nothing reports and the tab just times out
// closed: fail-closed, never a false alert.
export async function refreshLastCall(): Promise<void> {
  const state = await getState();
  if (!state.settings.tools.lastCallButler || state.campaignWatchlist.length === 0) return;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: CAMPAIGN_GRID_URL, active: false });
  } catch (error) {
    log("last-call", "could not open grid tab", error);
    return;
  }
  const tabId = tab.id;
  if (typeof tabId !== "number") return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolvePoll(tabId), POLL_DWELL_MS);
    pollTabs.set(tabId, { timer, resolve });
  });
}
