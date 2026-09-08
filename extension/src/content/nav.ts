// SPA navigation watcher for the content script. Amazon's storefront, Creator
// Hub, and Creator Connections surfaces rewrite history instead of reloading, so
// the content script has to notice URL changes itself. Three sources:
//
//   1. history.pushState / history.replaceState (wrapped) and popstate, which
//      catch every React-router transition.
//   2. window.navigation "navigate" (the Navigation API, Chrome 102+), which
//      also sees transitions the router performs through APIs we do not wrap.
//   3. Bounded polling, as a safety net for the SPA page types only: every 3s
//      for the first minute after a navigation, then every 15s, and never while
//      the tab is hidden. The previous implementation ran a 3s interval forever
//      on every page, which is one wake-up per 3s per Amazon tab for the life of
//      the tab, on pages that never change URL without a full load.

export interface WatchNavigationOptions {
  pageTypeForUrl: (url: string) => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
  document?: NavDocument;
  window?: NavWindow;
}

// The slice of document the watcher touches (visibility only).
export interface NavDocument {
  hidden: boolean;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
}

// The slice of window the watcher touches, so a test can pass a plain object.
export interface NavWindow {
  location: { href: string };
  history: Pick<History, "pushState" | "replaceState">;
  addEventListener: (type: string, listener: () => void) => void;
  navigation?: NavigationLike;
}

// Minimal Navigation API surface. TypeScript's lib.dom (5.9) does not ship the
// Navigation interface yet, so declare only what we call: addEventListener for
// the "navigate" event.
export interface NavigationLike {
  addEventListener: (type: "navigate", listener: () => void) => void;
}

// How long after a navigation we keep the fast poll cadence, and the two
// cadences themselves.
export const FAST_POLL_WINDOW_MS = 60_000;
export const FAST_POLL_MS = 3_000;
export const SLOW_POLL_MS = 15_000;

// Delay between polls as a function of time since the last navigation: the SPA
// is most likely to route again right after it routed (list -> detail -> back),
// so poll fast for the first minute, then back off.
export function nextPollDelay(elapsedMs: number): number {
  return elapsedMs < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
}

// Page types rendered by a client-side router, where a URL can change without a
// load event. Product, search, order-history, discovery and deals pages are
// server-rendered and navigate with a full load (the deals grid rewrites its
// query through pushState, which the history wrap already catches), so polling
// there is pure waste.
const SPA_PAGE_TYPES: ReadonlySet<string> = new Set([
  "storefront",
  "brand-store",
  "creator-upload",
  "creator-manage",
  "campaign-grid",
  "campaign-detail",
  "idea-list",
]);

export function shouldPollForNav(pageType: string): boolean {
  return SPA_PAGE_TYPES.has(pageType);
}

// Delay after a history/navigate event before reading location.href, so the
// router has committed the new URL (and usually the new view) first.
const EVENT_SETTLE_MS = 400;

// Start watching. `onChange` fires with the new URL every time location.href is
// observed to differ from the last URL this watcher saw. Returns a stop function
// (the content script never calls it, but tests and a future teardown do).
export function watchNavigation(
  onChange: (url: string) => void,
  opts: WatchNavigationOptions,
): () => void {
  const win: NavWindow = opts.window ?? (window as unknown as NavWindow);
  const doc: NavDocument = opts.document ?? document;
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => defaultSetTimer(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => defaultClearTimer(id));

  let stopped = false;
  let seenUrl = win.location.href;
  let lastNavAt = now();
  let pollTimer: number | null = null;

  // Compare the live URL with the last one we saw; on a change, tell the caller
  // and restart the fast poll window.
  const check = (): void => {
    if (stopped) return;
    const href = win.location.href;
    if (href === seenUrl) return;
    seenUrl = href;
    lastNavAt = now();
    onChange(href);
    schedulePoll();
  };

  const schedulePoll = (): void => {
    if (pollTimer !== null) {
      clearTimer(pollTimer);
      pollTimer = null;
    }
    if (stopped) return;
    if (!shouldPollForNav(opts.pageTypeForUrl(seenUrl))) return;
    pollTimer = setTimer(tick, nextPollDelay(now() - lastNavAt));
  };

  const tick = (): void => {
    pollTimer = null;
    if (stopped) return;
    // A hidden tab cannot be navigated by the user; the history wrap still
    // catches programmatic routing, and visibilitychange re-checks on return.
    if (!doc.hidden) check();
    schedulePoll();
  };

  const settle = (): void => {
    setTimer(check, EVENT_SETTLE_MS);
  };

  const wrap = (name: "pushState" | "replaceState"): void => {
    const original = win.history[name].bind(win.history);
    win.history[name] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      settle();
    };
  };
  wrap("pushState");
  wrap("replaceState");
  win.addEventListener("popstate", settle);
  // Chrome 102+: the Navigation API sees every same-document navigation,
  // including ones the router performs without touching history directly.
  try {
    win.navigation?.addEventListener("navigate", settle);
  } catch {
    // older Chrome or a locked-down page: the history wrap still covers us
  }
  // Coming back to a hidden tab: catch up on anything the skipped ticks missed
  // and resume polling.
  doc.addEventListener("visibilitychange", () => {
    if (!doc.hidden) {
      check();
      if (pollTimer === null) schedulePoll();
    }
  });

  schedulePoll();

  return () => {
    stopped = true;
    if (pollTimer !== null) {
      clearTimer(pollTimer);
      pollTimer = null;
    }
  };
}

// Indirection so the defaults resolve `window` lazily (the module is imported
// in the node test environment, where there is no window at load time).
function defaultSetTimer(fn: () => void, ms: number): number {
  return window.setTimeout(fn, ms);
}

function defaultClearTimer(id: number): void {
  window.clearTimeout(id);
}
