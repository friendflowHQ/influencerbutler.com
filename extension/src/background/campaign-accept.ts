import {
  ACCEPT_BLOCK_COOLDOWN_MS,
  ACCEPT_COOLDOWN_KEY,
  ACCEPT_HISTORY_MS,
  ACCEPT_LEDGER_KEY,
  ACCEPT_TAB_DWELL_MS,
  CAMPAIGN_DETAIL_URL,
  CAMPAIGN_GRID_URL,
} from "../shared/constants";
import { getFlags } from "../flags/cache";
import { getState } from "../storage/store";
import { log } from "../shared/log";
import type { AcceptLedgerView, AcceptOutcome, AcceptSource } from "../shared/messages";

// Standalone campaign accept: the background half.
//
// A creator without the desktop app clicks "Accept CC campaign" on a product
// page (or the Creator Hub upload page). The product page only knows the ASIN,
// so the panel first resolves the campaign id through LOOKUP_CC_RATES; then we
// open that campaign's page in a background tab and let the tab's own content
// script (tools/campaign-radar/accept-runner.ts) drive Amazon's OWN Accept
// button. We never replay Amazon's accept API: the click happens in a real
// page, exactly as if the creator had done it, and Amazon's own confirmation is
// what we read back.
//
// Tab lifecycle mirrors last-call.ts (open inactive, dwell, resolve on a
// content-script report) with the pendingByTab correlation of
// order-video-scan.ts: the tab posts ACCEPT_TAB_READY when its runner is armed,
// we answer RUN_ACCEPT, and it posts ACCEPT_RESULT. Accepts are serialized
// through one module promise chain so two clicks never race two tabs.
//
// Two local safety gates run before every accept: a robot-check cooldown (a
// blocked page pauses the tool for ACCEPT_BLOCK_COOLDOWN_MS) and the
// tools.standaloneAccept setting / remote "standaloneAccept" kill flag. A daily
// ledger records what was accepted, for the popup and for support.

const CAMPAIGN_ID_RE = /^amzn1\.campaign\.[A-Za-z0-9]+$/;
// The ledger keeps at most this many items for the day (a safety valve; a real
// creator accepts a handful).
const LEDGER_ITEM_CAP = 200;
// The rolling history keeps at most this many accepted ids (30 days at the
// daily hard cap, with room for manual accepts on top).
const HISTORY_ITEM_CAP = 1_000;

// ---- Daily ledger (pure helpers + storage wrappers) ---------------------------

export type AcceptLedgerItem = { campaignId: string; at: number; source: AcceptSource };
// One accepted campaign in the rolling history: kept for ACCEPT_HISTORY_MS
// across day rollovers, so the rule-based pass (auto-accept) never re-tries a
// campaign it already took, even after the daily count resets.
export type AcceptHistoryItem = { campaignId: string; at: number };
export type AcceptLedger = {
  day: string;
  count: number;
  items: AcceptLedgerItem[];
  history: AcceptHistoryItem[];
};

// Local calendar day, YYYY-MM-DD: "today" as the creator sees it, not UTC.
export function dayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function emptyLedger(day: string, history: AcceptHistoryItem[] = []): AcceptLedger {
  return { day, count: 0, items: [], history };
}

// Pure: drop history entries older than the 30-day window (and cap the list).
export function pruneHistory(history: AcceptHistoryItem[], now: number): AcceptHistoryItem[] {
  const cutoff = now - ACCEPT_HISTORY_MS;
  return history.filter((h) => h.at > cutoff).slice(-HISTORY_ITEM_CAP);
}

// Pure: is this campaign already in the ledger, today or in the 30-day history?
export function ledgerHasCampaign(
  ledger: Pick<AcceptLedger, "items" | "history">,
  campaignId: string,
): boolean {
  return (
    ledger.items.some((i) => i.campaignId === campaignId) ||
    ledger.history.some((h) => h.campaignId === campaignId)
  );
}

// Pure: coerce an untrusted stored value into a ledger for `now`'s day. A
// malformed blob yields a fresh empty ledger; one from an earlier day rolls
// over (count and items reset, the pruned history carries across).
export function readAcceptLedger(raw: unknown, now: number): AcceptLedger {
  const day = dayKey(now);
  if (!raw || typeof raw !== "object") return emptyLedger(day);
  const obj = raw as Record<string, unknown>;
  const items: AcceptLedgerItem[] = Array.isArray(obj.items)
    ? obj.items
        .filter(
          (i): i is AcceptLedgerItem =>
            !!i &&
            typeof i === "object" &&
            typeof (i as AcceptLedgerItem).campaignId === "string" &&
            typeof (i as AcceptLedgerItem).at === "number",
        )
        .map((i) => ({
          campaignId: i.campaignId,
          at: i.at,
          source: i.source === "auto" ? "auto" : "manual",
        }))
    : [];
  const history: AcceptHistoryItem[] = Array.isArray(obj.history)
    ? obj.history
        .filter(
          (h): h is AcceptHistoryItem =>
            !!h &&
            typeof h === "object" &&
            typeof (h as AcceptHistoryItem).campaignId === "string" &&
            typeof (h as AcceptHistoryItem).at === "number" &&
            Number.isFinite((h as AcceptHistoryItem).at),
        )
        .map((h) => ({ campaignId: h.campaignId, at: h.at }))
    : [];
  const ledger: AcceptLedger = {
    day: typeof obj.day === "string" ? obj.day : "",
    count: typeof obj.count === "number" && Number.isFinite(obj.count) ? Math.max(0, obj.count) : items.length,
    items,
    history: pruneHistory(history, now),
  };
  return rolloverIfNeeded(ledger, now);
}

// Pure: a ledger from a previous day starts over (keeping its pruned history);
// today's is returned as-is.
export function rolloverIfNeeded(ledger: AcceptLedger, now: number): AcceptLedger {
  const day = dayKey(now);
  return ledger.day === day ? ledger : emptyLedger(day, pruneHistory(ledger.history, now));
}

// Pure: append one accept (rolling the day over first). Returns a new ledger.
// The id also joins the rolling history (once: a repeat accept of the same
// campaign, e.g. a manual re-click after "pending", refreshes its stamp).
export function recordAccept(
  ledger: AcceptLedger,
  campaignId: string,
  source: AcceptSource,
  now: number,
): AcceptLedger {
  const base = rolloverIfNeeded(ledger, now);
  const items = [...base.items, { campaignId, at: now, source }].slice(-LEDGER_ITEM_CAP);
  const history = pruneHistory(
    [...base.history.filter((h) => h.campaignId !== campaignId), { campaignId, at: now }],
    now,
  );
  return { day: base.day, count: base.count + 1, items, history };
}

export async function loadAcceptLedger(now = Date.now()): Promise<AcceptLedger> {
  const raw = await chrome.storage.local.get(ACCEPT_LEDGER_KEY);
  return readAcceptLedger(raw[ACCEPT_LEDGER_KEY], now);
}

// Record an accept (from our own tab, or an in-page click reported by the grid
// overlay) into today's ledger.
export async function noteAccept(campaignId: string, source: AcceptSource): Promise<AcceptLedger> {
  const now = Date.now();
  const next = recordAccept(await loadAcceptLedger(now), campaignId, source, now);
  await chrome.storage.local.set({ [ACCEPT_LEDGER_KEY]: next });
  return next;
}

// Record several accepts from one rule-based pass in a single storage write.
export async function noteAccepts(campaignIds: string[], source: AcceptSource): Promise<AcceptLedger> {
  const now = Date.now();
  let ledger = await loadAcceptLedger(now);
  for (const id of campaignIds) ledger = recordAccept(ledger, id, source, now);
  if (campaignIds.length) await chrome.storage.local.set({ [ACCEPT_LEDGER_KEY]: ledger });
  return ledger;
}

// The ledger + cooldown as one plain view (GET_ACCEPT_LEDGER): what the options
// card and the rule-based runner read.
export async function loadAcceptLedgerView(now = Date.now()): Promise<AcceptLedgerView> {
  const ledger = await loadAcceptLedger(now);
  const cooldown = await loadCooldown();
  return {
    day: ledger.day,
    count: ledger.count,
    items: ledger.items,
    history: ledger.history,
    cooldownUntil: cooldown && cooldownActive(cooldown, now) ? cooldown.until : null,
  };
}

// ---- Robot-check cooldown -------------------------------------------------------

export type AcceptCooldown = { until: number };

// Pure: is a cooldown stamp still in force at `now`?
export function cooldownActive(cooldown: unknown, now: number): boolean {
  if (!cooldown || typeof cooldown !== "object") return false;
  const until = (cooldown as { until?: unknown }).until;
  return typeof until === "number" && Number.isFinite(until) && until > now;
}

export async function loadCooldown(): Promise<AcceptCooldown | null> {
  const raw = await chrome.storage.local.get(ACCEPT_COOLDOWN_KEY);
  const value = raw[ACCEPT_COOLDOWN_KEY];
  return cooldownActive(value, 0) ? (value as AcceptCooldown) : null;
}

// Start (or restart) the robot-check cooldown. Shared with the rule-based pass
// in last-call.ts, which pauses on the same "blocked" outcome.
export async function startCooldown(now: number): Promise<void> {
  await chrome.storage.local.set({
    [ACCEPT_COOLDOWN_KEY]: { until: now + ACCEPT_BLOCK_COOLDOWN_MS } satisfies AcceptCooldown,
  });
}

// ---- Tab driver -----------------------------------------------------------------

type Pending = {
  campaignId: string;
  started: boolean;
  done: boolean;
  timer: ReturnType<typeof setTimeout>;
  resolve: (outcome: AcceptOutcome) => void;
};

// Keyed by the tab we opened, so ACCEPT_TAB_READY / ACCEPT_RESULT from that tab
// (sender.tab.id) reach the request that spawned it and any other campaign tab
// the creator has open is ignored.
const pendingByTab = new Map<number, Pending>();

// One accept at a time: each request queues behind the previous one, and a
// failure in one never blocks the next.
let chain: Promise<unknown> = Promise.resolve();

export type AcceptInTabInput = {
  campaignId: string;
  asin: string | null;
  marketplace: string;
  source?: AcceptSource;
};

export function acceptCampaignInTab(input: AcceptInTabInput): Promise<AcceptOutcome> {
  const run = chain.then(
    () => runAccept(input),
    () => runAccept(input),
  );
  chain = run.catch(() => undefined);
  return run;
}

async function runAccept(input: AcceptInTabInput): Promise<AcceptOutcome> {
  const campaignId = String(input.campaignId ?? "").trim();
  if (!CAMPAIGN_ID_RE.test(campaignId)) return { ok: false, reason: "needs-id" };
  if (!(await standaloneAcceptEnabled())) return { ok: false, reason: "disabled" };

  const now = Date.now();
  if (cooldownActive(await loadCooldown(), now)) return { ok: false, reason: "cooldown" };

  // Attempt 1: the campaign's own page. UNVERIFIED URL shape (see
  // CAMPAIGN_DETAIL_URL); if that page never shows the campaign, fall back to
  // the grid, where the runner finds the card by id.
  let outcome = await driveTab(CAMPAIGN_DETAIL_URL(campaignId), campaignId);
  if (!outcome.ok && (outcome.reason === "not-found" || outcome.reason === "timeout")) {
    log("campaign-accept", `detail page did not resolve (${outcome.reason}); trying the grid`);
    outcome = await driveTab(CAMPAIGN_GRID_URL, campaignId);
  }

  if (!outcome.ok && outcome.reason === "blocked") {
    await startCooldown(Date.now());
  } else if (outcome.ok) {
    await noteAccept(campaignId, input.source ?? "manual");
  }
  return outcome;
}

async function standaloneAcceptEnabled(): Promise<boolean> {
  const state = await getState();
  if (!state.settings.tools.standaloneAccept) return false;
  // The remote kill switch: the content script applies disabledTools to its own
  // settings copy, but this worker path reads storage directly, so honor the
  // flag here too or a killed tool could still open tabs.
  const flags = await getFlags();
  if (flags?.disableAll) return false;
  if (flags?.disabledTools.includes("standaloneAccept")) return false;
  return true;
}

// Open `url` inactive, wait for the tab's runner to report, close the tab.
// Resolves "timeout" when nothing reports inside ACCEPT_TAB_DWELL_MS (a signed
// out page never arms the runner with a card, so this is the fail-closed path).
function driveTab(url: string, campaignId: string): Promise<AcceptOutcome> {
  return chrome.tabs
    .create({ url, active: false })
    .then((tab) => {
      const tabId = tab.id;
      if (typeof tabId !== "number") return { ok: false, reason: "tab" } as AcceptOutcome;
      return new Promise<AcceptOutcome>((resolve) => {
        const timer = setTimeout(
          () => finish(tabId, { ok: false, reason: "timeout" }),
          ACCEPT_TAB_DWELL_MS,
        );
        pendingByTab.set(tabId, { campaignId, started: false, done: false, timer, resolve });
      });
    })
    .catch((error) => {
      log("campaign-accept", "could not open accept tab", error);
      return { ok: false, reason: "tab" } as AcceptOutcome;
    });
}

// ACCEPT_TAB_READY from a tab: if it is one of ours and not yet started, tell it
// which campaign to accept. A tab we did not open is simply ignored.
export function noteAcceptTabReady(tabId: number | undefined): void {
  if (typeof tabId !== "number") return;
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done || pending.started) return;
  pending.started = true;
  void chrome.tabs
    .sendMessage(tabId, { kind: "RUN_ACCEPT", campaignId: pending.campaignId })
    .catch((error) => {
      log("campaign-accept", "RUN_ACCEPT send failed", error);
      finish(tabId, { ok: false, reason: "tab" });
    });
}

// ACCEPT_RESULT from a tab: resolve the request that opened it.
export function noteAcceptResult(
  tabId: number | undefined,
  campaignId: string,
  outcome: AcceptOutcome,
): void {
  if (typeof tabId !== "number") return;
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done || pending.campaignId !== campaignId) return;
  finish(tabId, outcome);
}

function finish(tabId: number, outcome: AcceptOutcome): void {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  pendingByTab.delete(tabId);
  clearTimeout(pending.timer);
  void chrome.tabs.remove(tabId).catch(() => {
    // tab may already be gone (user closed it)
  });
  pending.resolve(outcome);
}

// A creator closing our tab mid-run must not leave the request hanging until
// the dwell timeout.
try {
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    if (pendingByTab.has(tabId)) finish(tabId, { ok: false, reason: "tab" });
  });
} catch {
  // chrome.tabs unavailable (tests); the dwell timer still bounds every run
}
