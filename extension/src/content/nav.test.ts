import { describe, expect, it } from "vitest";
import {
  FAST_POLL_MS,
  SLOW_POLL_MS,
  nextPollDelay,
  shouldPollForNav,
  watchNavigation,
  type NavWindow,
} from "./nav";

// The suite runs in the node environment with no DOM, so the watcher is driven
// through its injectable window/document/timer seams with a hand-rolled clock.

describe("shouldPollForNav", () => {
  it("polls only the client-side-routed page types", () => {
    for (const t of [
      "storefront",
      "brand-store",
      "creator-upload",
      "creator-manage",
      "campaign-grid",
      "campaign-detail",
      "idea-list",
    ]) {
      expect(shouldPollForNav(t), t).toBe(true);
    }
    for (const t of ["product", "order-history", "search", "discovery", "deals", "other", ""]) {
      expect(shouldPollForNav(t), t).toBe(false);
    }
  });
});

describe("nextPollDelay", () => {
  it("is fast for the first minute after a navigation, then slow", () => {
    expect(nextPollDelay(0)).toBe(FAST_POLL_MS);
    expect(nextPollDelay(59_999)).toBe(FAST_POLL_MS);
    expect(nextPollDelay(60_000)).toBe(SLOW_POLL_MS);
    expect(nextPollDelay(10 * 60_000)).toBe(SLOW_POLL_MS);
  });
});

// A deterministic clock + timer queue.
function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
    pending: () => timers.size,
    // Advance the clock, firing due timers in order.
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let next: [number, { at: number; fn: () => void }] | null = null;
        for (const entry of timers) {
          if (entry[1].at <= target && (next === null || entry[1].at < next[1].at)) next = entry;
        }
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
  };
}

function makeWindow(href: string) {
  const listeners = new Map<string, Array<() => void>>();
  const navListeners: Array<() => void> = [];
  const win: NavWindow & { fire: (type: string) => void; fireNavigate: () => void } = {
    location: { href },
    history: {
      pushState: () => undefined,
      replaceState: () => undefined,
    },
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    navigation: {
      addEventListener: (_type, listener) => {
        navListeners.push(listener);
      },
    },
    fire: (type) => {
      for (const l of listeners.get(type) ?? []) l();
    },
    fireNavigate: () => {
      for (const l of navListeners) l();
    },
  };
  return win;
}

function makeDocument() {
  const listeners: Array<() => void> = [];
  const doc = {
    hidden: false,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
    setHidden(hidden: boolean) {
      doc.hidden = hidden;
      for (const l of listeners) l();
    },
  };
  return doc;
}

describe("watchNavigation", () => {
  it("fires onChange after pushState once the URL has settled", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const seen: string[] = [];
    watchNavigation((url) => seen.push(url), {
      pageTypeForUrl: () => "storefront",
      ...clock,
      document: doc,
      window: win,
    });

    win.location.href = "https://www.amazon.com/shop/creator/list/ABC";
    win.history.pushState(null, "", "/shop/creator/list/ABC");
    expect(seen).toEqual([]); // not yet: the router has 400ms to commit
    clock.advance(400);
    expect(seen).toEqual(["https://www.amazon.com/shop/creator/list/ABC"]);
  });

  it("reacts to replaceState, popstate, and the Navigation API", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const seen: string[] = [];
    watchNavigation((url) => seen.push(url), {
      pageTypeForUrl: () => "other",
      ...clock,
      document: doc,
      window: win,
    });

    win.location.href = "https://www.amazon.com/a";
    win.history.replaceState(null, "", "/a");
    clock.advance(400);
    win.location.href = "https://www.amazon.com/b";
    win.fire("popstate");
    clock.advance(400);
    win.location.href = "https://www.amazon.com/c";
    win.fireNavigate();
    clock.advance(400);
    expect(seen).toEqual([
      "https://www.amazon.com/a",
      "https://www.amazon.com/b",
      "https://www.amazon.com/c",
    ]);
  });

  it("does not fire when the URL is unchanged", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const seen: string[] = [];
    watchNavigation((url) => seen.push(url), {
      pageTypeForUrl: () => "storefront",
      ...clock,
      document: doc,
      window: win,
    });
    win.history.pushState(null, "", "/shop/creator");
    win.fire("popstate");
    clock.advance(5 * 60_000);
    expect(seen).toEqual([]);
  });

  it("never polls on server-rendered page types", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/dp/B000000000");
    const doc = makeDocument();
    watchNavigation(() => undefined, {
      pageTypeForUrl: () => "product",
      ...clock,
      document: doc,
      window: win,
    });
    expect(clock.pending()).toBe(0);
  });

  it("polls every 3s for the first minute, then every 15s", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    let ticks = 0;
    const setTimer = (fn: () => void, ms: number) => {
      if (ms !== 400) ticks += 1;
      return clock.setTimer(fn, ms);
    };
    watchNavigation(() => undefined, {
      pageTypeForUrl: () => "storefront",
      now: clock.now,
      setTimer,
      clearTimer: clock.clearTimer,
      document: doc,
      window: win,
    });
    // One poll is armed immediately; the first minute schedules 20 fast polls.
    expect(ticks).toBe(1);
    clock.advance(60_000);
    expect(ticks).toBe(21);
    // The next 15 minutes schedule one slow poll per 15s (60 total).
    clock.advance(15 * 60_000);
    expect(ticks).toBe(81);
  });

  it("catches a silent URL change through polling and resets the fast window", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const seen: string[] = [];
    const delays: number[] = [];
    const setTimer = (fn: () => void, ms: number) => {
      delays.push(ms);
      return clock.setTimer(fn, ms);
    };
    watchNavigation((url) => seen.push(url), {
      pageTypeForUrl: () => "storefront",
      now: clock.now,
      setTimer,
      clearTimer: clock.clearTimer,
      document: doc,
      window: win,
    });
    clock.advance(2 * 60_000); // now on the slow cadence
    expect(delays.at(-1)).toBe(SLOW_POLL_MS);
    // A route change that bypassed every hook: the slow poll still catches it
    // within 15s and the cadence drops back to fast.
    win.location.href = "https://www.amazon.com/shop/creator/list/ABC";
    clock.advance(SLOW_POLL_MS);
    expect(seen).toEqual(["https://www.amazon.com/shop/creator/list/ABC"]);
    expect(delays.at(-1)).toBe(FAST_POLL_MS);
  });

  it("skips poll ticks while the tab is hidden and catches up on return", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const seen: string[] = [];
    watchNavigation((url) => seen.push(url), {
      pageTypeForUrl: () => "storefront",
      ...clock,
      document: doc,
      window: win,
    });
    doc.setHidden(true);
    win.location.href = "https://www.amazon.com/shop/creator/list/ABC";
    clock.advance(60_000);
    expect(seen).toEqual([]); // hidden: every tick skipped
    doc.setHidden(false);
    expect(seen).toEqual(["https://www.amazon.com/shop/creator/list/ABC"]);
  });

  it("stops polling once torn down", () => {
    const clock = makeClock();
    const win = makeWindow("https://www.amazon.com/shop/creator");
    const doc = makeDocument();
    const stop = watchNavigation(() => undefined, {
      pageTypeForUrl: () => "storefront",
      ...clock,
      document: doc,
      window: win,
    });
    expect(clock.pending()).toBe(1);
    stop();
    expect(clock.pending()).toBe(0);
  });
});
