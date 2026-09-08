import { describe, expect, it } from "vitest";
import {
  CONNECTED_CHECK_MS,
  DEBOUNCE_MS,
  createWidgetObserverHub,
  isInsideOwnHost,
  isOwnMutation,
  type DocumentLike,
  type ElementLike,
  type NodeLike,
  type ObserverLike,
  type RecordLike,
} from "./observer";

// The suite runs in the node environment with no DOM, so the hub is driven
// through its injectable seams: a fake document tree, a fake MutationObserver
// the test feeds records into, and a hand-rolled timer queue.

function el(classes: string[] = [], parent: ElementLike | null = null): ElementLike {
  const node: ElementLike = {
    parentNode: parent,
    parentElement: parent,
    isConnected: parent ? parent.isConnected : true,
    classList: { contains: (c) => classes.includes(c) },
  };
  return node;
}

function textNode(parent: NodeLike | null): NodeLike {
  return { parentNode: parent, isConnected: parent?.isConnected ?? false };
}

function rec(target: NodeLike, added: NodeLike[] = [], removed: NodeLike[] = []): RecordLike {
  return { target, addedNodes: added, removedNodes: removed };
}

const HOSTS = ["bkw-chip-host", "mtpl-host"];

describe("isInsideOwnHost", () => {
  it("matches a host and anything beneath it, up to the walk limit", () => {
    const body = el();
    const host = el(["mtpl-host"], body);
    const inner = el(["btn"], host);
    const text = textNode(inner);
    expect(isInsideOwnHost(host, HOSTS)).toBe(true);
    expect(isInsideOwnHost(inner, HOSTS)).toBe(true);
    expect(isInsideOwnHost(text, HOSTS)).toBe(true);
    expect(isInsideOwnHost(body, HOSTS)).toBe(false);
    expect(isInsideOwnHost(null, HOSTS)).toBe(false);
  });
});

describe("isOwnMutation", () => {
  const body = el();
  const widget = el(["panel"], body);

  it("ignores a mutation inside one of our hosts", () => {
    const host = el(["bkw-chip-host"], widget);
    expect(isOwnMutation(rec(host, [el(["chip"], host)]), HOSTS)).toBe(true);
  });

  it("ignores our host being mounted or removed", () => {
    const host = el(["mtpl-host"], widget);
    expect(isOwnMutation(rec(widget, [host]), HOSTS)).toBe(true);
    expect(isOwnMutation(rec(widget, [], [host]), HOSTS)).toBe(true);
  });

  it("keeps a mutation that adds a foreign node alongside ours", () => {
    const host = el(["mtpl-host"], widget);
    const row = el(["row"], widget);
    expect(isOwnMutation(rec(widget, [host, row]), HOSTS)).toBe(false);
  });

  it("keeps an ordinary page mutation", () => {
    expect(isOwnMutation(rec(widget, [el(["row"], widget)]), HOSTS)).toBe(false);
    expect(isOwnMutation(rec(widget), HOSTS)).toBe(false);
    expect(isOwnMutation(rec(widget, [textNode(widget)]), HOSTS)).toBe(false);
  });
});

// ── hub harness ──────────────────────────────────────────────────────────────

function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
    pending: () => timers.size,
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

interface FakeDoc extends DocumentLike {
  widget: ElementLike | null;
}

function makeHarness() {
  const clock = makeClock();
  const body = el();
  const doc: FakeDoc = { body, hidden: false, widget: null };
  const observeLog: NodeLike[] = [];
  let disconnects = 0;
  let created = 0;
  let emit: ((records: RecordLike[]) => void) | null = null;
  const visible: Array<() => void> = [];
  const hub = createWidgetObserverHub<FakeDoc>({
    document: () => doc,
    findWidget: (d) => d.widget,
    createObserver: (onRecords) => {
      created += 1;
      emit = onRecords;
      const observer: ObserverLike = {
        observe: (target) => {
          observeLog.push(target);
        },
        disconnect: () => {
          disconnects += 1;
        },
      };
      return observer;
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onVisible: (fn) => {
      visible.push(fn);
    },
  });
  return {
    hub,
    doc,
    body,
    clock,
    observeLog,
    emit: (records: RecordLike[]) => emit?.(records),
    disconnects: () => disconnects,
    created: () => created,
    becomeVisible: () => {
      doc.hidden = false;
      for (const fn of visible) fn();
    },
  };
}

describe("createWidgetObserverHub", () => {
  it("starts one observer on body for the first subscriber and dispatches an initial pass", () => {
    const h = makeHarness();
    let a = 0;
    let b = 0;
    h.hub.subscribe(() => a++);
    h.hub.subscribe(() => b++);
    expect(h.created()).toBe(1);
    expect(h.observeLog).toEqual([h.body]);
    expect(a).toBe(0);
    h.clock.advance(DEBOUNCE_MS);
    // Both initialised in the same tick: one shared dispatch each.
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("debounces a burst of mutations into one dispatch for every subscriber", () => {
    const h = makeHarness();
    let a = 0;
    let b = 0;
    h.hub.subscribe(() => a++);
    h.hub.subscribe(() => b++);
    h.clock.advance(DEBOUNCE_MS);
    const row = el(["row"], h.body);
    for (let i = 0; i < 10; i += 1) h.emit([rec(h.body, [row])]);
    expect(a).toBe(1);
    h.clock.advance(DEBOUNCE_MS);
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  it("ignores mutations caused by our own hosts", () => {
    const h = makeHarness();
    let a = 0;
    h.hub.subscribe(() => a++);
    h.clock.advance(DEBOUNCE_MS);
    const host = el(["mtpl-host"], h.body);
    h.emit([rec(h.body, [host])]); // toolbar mounted
    h.emit([rec(host, [el(["btn"], host)])]); // toolbar rendering inside
    h.clock.advance(DEBOUNCE_MS * 2);
    expect(a).toBe(1);
    expect(h.clock.pending()).toBe(0);
  });

  it("narrows to the widget's parent once found and re-widens when it unmounts", () => {
    const h = makeHarness();
    h.hub.subscribe(() => undefined);
    const portal = el(["portal"], h.body);
    h.doc.widget = el(["panel"], portal);
    h.clock.advance(DEBOUNCE_MS); // initial pass finds the widget
    expect(h.hub.observedTarget()).toBe(portal);
    expect(h.observeLog).toEqual([h.body, portal]);
    // Widget closed: the removal fires on the portal; we go wide again.
    h.doc.widget = null;
    h.emit([rec(portal, [], [el(["panel"], portal)])]);
    h.clock.advance(DEBOUNCE_MS);
    expect(h.hub.observedTarget()).toBe(h.body);
    // Reopened: back to the portal.
    h.doc.widget = el(["panel"], portal);
    h.emit([rec(portal, [h.doc.widget])]);
    h.clock.advance(DEBOUNCE_MS);
    expect(h.hub.observedTarget()).toBe(portal);
  });

  it("re-widens when the observed ancestor is detached from above", () => {
    const h = makeHarness();
    let a = 0;
    h.hub.subscribe(() => a++);
    const portal = el(["portal"], h.body);
    h.doc.widget = el(["panel"], portal);
    h.clock.advance(DEBOUNCE_MS);
    expect(h.hub.observedTarget()).toBe(portal);
    // The whole portal is unmounted: no mutation reaches us.
    portal.isConnected = false;
    h.doc.widget = null;
    h.clock.advance(CONNECTED_CHECK_MS + DEBOUNCE_MS);
    expect(h.hub.observedTarget()).toBe(h.body);
    expect(a).toBe(2); // subscribers were told, so they can notice the panel is gone
  });

  it("does not dispatch while hidden and catches up once on return", () => {
    const h = makeHarness();
    let a = 0;
    h.hub.subscribe(() => a++);
    h.clock.advance(DEBOUNCE_MS);
    h.doc.hidden = true;
    const row = el(["row"], h.body);
    h.emit([rec(h.body, [row])]);
    h.emit([rec(h.body, [row])]);
    h.clock.advance(DEBOUNCE_MS * 4);
    expect(a).toBe(1);
    h.becomeVisible();
    h.clock.advance(DEBOUNCE_MS);
    expect(a).toBe(2);
    // Nothing missed: a later return is silent.
    h.becomeVisible();
    h.clock.advance(DEBOUNCE_MS);
    expect(a).toBe(2);
  });

  it("reference-counts subscribers and disconnects when the last leaves", () => {
    const h = makeHarness();
    const offA = h.hub.subscribe(() => undefined);
    const offB = h.hub.subscribe(() => undefined);
    expect(h.hub.subscriberCount()).toBe(2);
    offA();
    offA(); // idempotent
    expect(h.hub.subscriberCount()).toBe(1);
    expect(h.hub.observedTarget()).toBe(h.body); // still observing for B
    offB();
    expect(h.hub.subscriberCount()).toBe(0);
    expect(h.hub.observedTarget()).toBeNull();
    expect(h.clock.pending()).toBe(0); // the pending initial dispatch was cancelled
    // A late mutation from the old observer is a no-op.
    h.emit([rec(h.body, [el(["row"], h.body)])]);
    h.clock.advance(DEBOUNCE_MS);
    // Re-subscribing builds a fresh observer.
    h.hub.subscribe(() => undefined);
    expect(h.created()).toBe(2);
  });

  it("keeps dispatching to the survivors when one subscriber throws", () => {
    const h = makeHarness();
    let b = 0;
    h.hub.subscribe(() => {
      throw new Error("boom");
    });
    h.hub.subscribe(() => b++);
    h.clock.advance(DEBOUNCE_MS);
    expect(b).toBe(1);
  });
});
