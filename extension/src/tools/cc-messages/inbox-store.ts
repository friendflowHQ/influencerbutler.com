// The browser side of the full-inbox read: runs inbox-api against the page's own
// origin (the creator is already signed in, and the chat API wants their cookies
// plus the storefront's `storeid` header), keeps the result in inbox-cache's
// persisted `ib-cc-inbox`, and then fills in "who wrote last" thread by thread in
// the background. Nothing leaves the browser: the data goes from Amazon to
// chrome.storage.local.
//
// It degrades silently: no session facts yet, an expired login, a changed
// endpoint or a rate limit all leave the cache as it was, and the Messages tools
// keep working from the drawer's own rows.

import { log } from "../../shared/log";
import {
  InboxApiError,
  fetchAllInboxRows,
  fetchThreadStatus,
  type ApiDeps,
  type ApiFetch,
} from "./inbox-api";
import {
  EMPTY_CACHE,
  INBOX_KEY,
  applyThreadStatus,
  inboxCounts,
  mergeInbox,
  normalizeCache,
  pickThreadWork,
  type InboxCache,
} from "./inbox-cache";
import {
  EMPTY_SESSION,
  mergeSession,
  normalizeSession,
  parseActorIdFromText,
  parseActorIdFromUrl,
  parseStoreIdFromText,
  type CcSession,
} from "./session";

const SESSION_KEY = "ib-cc-session";
// How soon after a successful read another may start.
const SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;
// Thread reads per run, and the pause between them (the desktop uses 400ms).
const THREAD_BUDGET_PER_RUN = 60;
const THREAD_GAP_MS = 400;
// Retry a sync that had no session facts yet.
const SESSION_WAIT_MS = 4000;

let cache: InboxCache = EMPTY_CACHE;
let captured: CcSession = { ...EMPTY_SESSION };
let stored: CcSession = { ...EMPTY_SESSION };
let loaded = false;
let running = false;
let lastSyncAt = 0;
let epoch = 0;
const listeners = new Set<() => void>();
let waitTimer: number | null = null;
let stopListening: (() => void) | null = null;

const realFetch: ApiFetch = (url, init) => fetch(url, init) as unknown as ReturnType<ApiFetch>;

// Run `listener` whenever the cache changes (a sync or a batch of thread reads).
// Returns an unsubscribe function.
export function subscribeInbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch (error) {
      log("cc-messages", "inbox listener failed", error);
    }
  }
}

export function getInbox(): InboxCache {
  return cache;
}

export function getInboxCounts(): { total: number; unread: number } {
  return inboxCounts(cache);
}

// ── persistence ──────────────────────────────────────────────────────────────

export async function loadInbox(): Promise<void> {
  try {
    const got = await chrome.storage.local.get([INBOX_KEY, SESSION_KEY]);
    // A sync may have landed while this awaited: only fill an empty cache.
    if (cache.syncedAt === 0) cache = normalizeCache(got?.[INBOX_KEY]);
    stored = normalizeSession(got?.[SESSION_KEY]);
  } catch (error) {
    log("cc-messages", "load inbox failed", error);
  }
  loaded = true;
}

function persistCache(): void {
  void chrome.storage.local.set({ [INBOX_KEY]: cache }).catch(() => undefined);
}

function persistSession(session: CcSession): void {
  void chrome.storage.local.set({ [SESSION_KEY]: session }).catch(() => undefined);
}

// ── session ──────────────────────────────────────────────────────────────────

function readPageSession(): CcSession {
  let pageText = "";
  try {
    pageText = document.body?.innerText?.slice(0, 20000) ?? "";
  } catch {
    pageText = "";
  }
  return {
    storeId: parseStoreIdFromText(pageText),
    actorId: parseActorIdFromUrl(location.href) || parseActorIdFromText(pageText),
  };
}

function currentSession(): CcSession {
  return mergeSession(captured, stored, readPageSession());
}

function onSessionEvent(event: Event): void {
  const detail = (event as CustomEvent<Partial<CcSession>>).detail;
  const next = mergeSession(detail, captured);
  if (next.storeId === captured.storeId && next.actorId === captured.actorId) return;
  captured = next;
  persistSession(mergeSession(captured, stored));
  stored = mergeSession(captured, stored);
  // A request that carried a new fact may be the one we were waiting for.
  scheduleSync(0);
}

// ── sync ─────────────────────────────────────────────────────────────────────

function scheduleSync(delayMs: number): void {
  if (waitTimer !== null) window.clearTimeout(waitTimer);
  const myEpoch = epoch;
  waitTimer = window.setTimeout(() => {
    waitTimer = null;
    if (myEpoch === epoch) void syncInbox(myEpoch);
  }, delayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function syncInbox(myEpoch: number): Promise<void> {
  if (running || myEpoch !== epoch) return;
  if (!loaded) await loadInbox();
  if (myEpoch !== epoch) return;
  const sinceLast = Date.now() - lastSyncAt;
  if (cache.syncedAt > 0 && sinceLast < SYNC_MIN_INTERVAL_MS && lastSyncAt > 0) {
    // Fresh enough for the list, but threads may still need reading.
    void readThreads(myEpoch);
    return;
  }
  const session = currentSession();
  if (!session.storeId) {
    // The page's own requests have not shown the storefront id yet.
    scheduleSync(SESSION_WAIT_MS);
    return;
  }
  running = true;
  try {
    const deps: ApiDeps = { fetchFn: realFetch, storeId: session.storeId };
    const rows = await fetchAllInboxRows(deps);
    if (myEpoch !== epoch) return;
    cache = mergeInbox(cache, rows, Date.now());
    lastSyncAt = Date.now();
    persistCache();
    persistSession(mergeSession(session, stored));
    log("cc-messages", "inbox synced", inboxCounts(cache));
    notify();
  } catch (error) {
    if (error instanceof InboxApiError && error.code === "session-expired") {
      log("cc-messages", "inbox sync: session expired");
    } else {
      log("cc-messages", "inbox sync failed", error);
    }
    return;
  } finally {
    running = false;
  }
  void readThreads(myEpoch);
}

// Read threads for conversations whose status is unknown or out of date, newest
// first, a small budget per run so a big inbox fills in over a few visits.
async function readThreads(myEpoch: number): Promise<void> {
  if (running || myEpoch !== epoch) return;
  const session = currentSession();
  if (!session.actorId || !session.storeId) return;
  const work = pickThreadWork(cache, THREAD_BUDGET_PER_RUN);
  if (work.length === 0) return;
  running = true;
  const deps: ApiDeps = { fetchFn: realFetch, storeId: session.storeId };
  let done = 0;
  try {
    for (const { key, row } of work) {
      if (myEpoch !== epoch) return;
      try {
        const status = await fetchThreadStatus(deps, { actorId: session.actorId, brand: row.brand, token: row.token });
        cache = applyThreadStatus(cache, key, row.lastMsgAt, status);
        done += 1;
      } catch (error) {
        // A login that expired or a limit that will not clear: stop, keep what we got.
        if (error instanceof InboxApiError) break;
      }
      // Surface progress every few threads so chips appear while it works.
      if (done > 0 && done % 10 === 0) {
        persistCache();
        notify();
      }
      await sleep(THREAD_GAP_MS);
    }
  } finally {
    running = false;
    if (done > 0) {
      persistCache();
      notify();
      log("cc-messages", "threads read", { done, remaining: pickThreadWork(cache, 100000).length });
    }
  }
}

// Start reading the inbox on this Creator Connections page. Listeners added with
// subscribeInbox hear about every change. Returns a stop function.
export function startInboxSync(): () => void {
  stopInboxSync();
  epoch += 1;
  const myEpoch = epoch;
  document.addEventListener("ib-ext-cc-session", onSessionEvent);
  stopListening = () => document.removeEventListener("ib-ext-cc-session", onSessionEvent);
  void (async () => {
    await loadInbox();
    if (myEpoch !== epoch) return;
    notify();
    // The hook's first request usually lands within a moment of page load.
    scheduleSync(1500);
  })();
  return stopInboxSync;
}

export function stopInboxSync(): void {
  epoch += 1;
  stopListening?.();
  stopListening = null;
  if (waitTimer !== null) {
    window.clearTimeout(waitTimer);
    waitTimer = null;
  }
  running = false;
}

// Test/teardown helper: forget everything held in memory (storage is untouched).
export function resetInboxStore(): void {
  stopInboxSync();
  cache = EMPTY_CACHE;
  captured = { ...EMPTY_SESSION };
  stored = { ...EMPTY_SESSION };
  loaded = false;
  lastSyncAt = 0;
}
