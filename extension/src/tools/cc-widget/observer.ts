import { findMessagesWidget } from "../brand-keywords/selectors";
import { HOST_CLASS as TEMPLATES_HOST_CLASS } from "../message-templates/toolbar";

// One shared MutationObserver for the Creator Connections Messages widget.
//
// Brand Keywords and Message Templates both decorate the same floating panel,
// and each used to own a body-wide `subtree: true` observer: two callbacks per
// React mutation across the whole Creator Connections page, for the life of
// the view. This hub owns a single observer and:
//
//   - starts on document.body (the panel may not be open yet), then narrows to
//     the widget's parent once the panel is found, so the rest of the page's
//     churn no longer wakes us;
//   - re-widens to body when the widget unmounts, so the next open is seen;
//   - ignores mutations caused by our own injected hosts (the chip and toolbar
//     shadow hosts), which would otherwise re-trigger the sweeps that made them;
//   - debounces the burst into one dispatch;
//   - reference-counts subscribers and disconnects when the last one leaves.

// Coalesce React's burst of mutations into one dispatch.
export const DEBOUNCE_MS = 250;
// While narrowed, how often to confirm the observed ancestor is still in the
// document. A removal higher up the tree fires no mutation on the node we
// observe, so without this an unmounted portal would leave us watching a
// detached subtree until the next SPA navigation tore the tools down.
export const CONNECTED_CHECK_MS = 5_000;

// Our own injected hosts: the Brand Keywords chip host (chip.ts) and the Message
// Templates toolbar host (toolbar.ts).
export const OWN_HOST_CLASSES: readonly string[] = ["bkw-chip-host", TEMPLATES_HOST_CLASS];

// Structural slices of the DOM so a test can drive the hub with plain objects.
export interface NodeLike {
  parentNode: NodeLike | null;
  isConnected: boolean;
  classList?: { contains: (cls: string) => boolean };
}
export interface ElementLike extends NodeLike {
  parentElement: ElementLike | null;
}
export interface RecordLike {
  target: NodeLike;
  addedNodes: ArrayLike<NodeLike>;
  removedNodes: ArrayLike<NodeLike>;
}
export interface ObserverLike {
  observe: (target: NodeLike, init: MutationObserverInit) => void;
  disconnect: () => void;
}
export interface DocumentLike {
  body: ElementLike;
  hidden: boolean;
}

export interface WidgetObserverDeps<D extends DocumentLike> {
  document: () => D;
  findWidget: (doc: D) => ElementLike | null;
  createObserver: (onRecords: (records: RecordLike[]) => void) => ObserverLike;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  // Register a callback for "the tab became visible again"; used to catch up on
  // mutations dropped while hidden. Optional so a test can omit it.
  onVisible?: (fn: () => void) => void;
  ownHostClasses?: readonly string[];
}

export interface WidgetObserverHub {
  subscribe: (cb: () => void) => () => void;
  // Test/diagnostic seams.
  subscriberCount: () => number;
  observedTarget: () => NodeLike | null;
}

// True when `node` is one of our injected hosts or lives inside one.
export function isInsideOwnHost(node: NodeLike | null, hostClasses: readonly string[]): boolean {
  let cur: NodeLike | null = node;
  for (let depth = 0; cur && depth < 64; depth += 1) {
    const list = cur.classList;
    if (list && hostClasses.some((cls) => list.contains(cls))) return true;
    cur = cur.parentNode;
  }
  return false;
}

// A record is ours when its target sits inside one of our hosts (chip / toolbar
// internals rendering), or when every node it added or removed is one of our
// hosts (a chip or toolbar being mounted or torn down). Such a record must not
// wake the sweeps, or every mount would schedule another sweep of its own.
export function isOwnMutation(record: RecordLike, hostClasses: readonly string[]): boolean {
  if (isInsideOwnHost(record.target, hostClasses)) return true;
  const moved = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  if (moved.length === 0) return false;
  return moved.every((node) => {
    const list = node.classList;
    return !!list && hostClasses.some((cls) => list.contains(cls));
  });
}

export function createWidgetObserverHub<D extends DocumentLike>(
  deps: WidgetObserverDeps<D>,
): WidgetObserverHub {
  const hostClasses = deps.ownHostClasses ?? OWN_HOST_CLASSES;
  const subscribers = new Set<() => void>();
  let observer: ObserverLike | null = null;
  let target: NodeLike | null = null;
  let debounceTimer: number | null = null;
  let connectedTimer: number | null = null;
  // Set when a real mutation arrived while the tab was hidden, so the next
  // visibilitychange dispatches once instead of the mutations being lost.
  let missedWhileHidden = false;
  let visibilityHooked = false;

  const observe = (next: NodeLike): void => {
    if (!observer || target === next) return;
    observer.disconnect();
    observer.observe(next, { childList: true, subtree: true });
    target = next;
  };

  // Point the observer at the tightest useful ancestor: the widget's parent
  // when the panel is open (so a remount into the same parent is still seen),
  // body otherwise.
  const retarget = (): void => {
    const doc = deps.document();
    const widget = deps.findWidget(doc);
    const parent = widget?.parentElement ?? null;
    if (parent && parent.isConnected) {
      observe(parent);
      armConnectedCheck();
    } else {
      observe(doc.body);
      disarmConnectedCheck();
    }
  };

  const armConnectedCheck = (): void => {
    if (connectedTimer !== null) return;
    connectedTimer = deps.setTimer(() => {
      connectedTimer = null;
      if (!observer) return;
      const doc = deps.document();
      if (target && target !== doc.body && !target.isConnected) {
        // The ancestor we watched was unmounted from above us; go wide again
        // and let the subscribers notice the panel is gone.
        observe(doc.body);
        schedule();
        return;
      }
      if (target !== doc.body) armConnectedCheck();
    }, CONNECTED_CHECK_MS);
  };

  const disarmConnectedCheck = (): void => {
    if (connectedTimer !== null) {
      deps.clearTimer(connectedTimer);
      connectedTimer = null;
    }
  };

  const schedule = (): void => {
    if (debounceTimer !== null) return;
    debounceTimer = deps.setTimer(() => {
      debounceTimer = null;
      if (!observer) return;
      retarget();
      for (const cb of Array.from(subscribers)) {
        try {
          cb();
        } catch {
          // a subscriber's failure must not starve the others
        }
      }
    }, DEBOUNCE_MS);
  };

  const onRecords = (records: RecordLike[]): void => {
    if (!observer) return; // a late callback from an observer we already dropped
    if (records.every((r) => isOwnMutation(r, hostClasses))) return;
    if (deps.document().hidden) {
      // Nobody is looking: remember that something changed and sweep once on
      // return rather than per burst in the background.
      missedWhileHidden = true;
      return;
    }
    schedule();
  };

  const hookVisibility = (): void => {
    if (visibilityHooked || !deps.onVisible) return;
    visibilityHooked = true;
    deps.onVisible(() => {
      if (!observer || !missedWhileHidden) return;
      missedWhileHidden = false;
      schedule();
    });
  };

  const start = (): void => {
    observer = deps.createObserver(onRecords);
    target = null;
    missedWhileHidden = false;
    observe(deps.document().body);
    hookVisibility();
  };

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
    target = null;
    if (debounceTimer !== null) {
      deps.clearTimer(debounceTimer);
      debounceTimer = null;
    }
    disarmConnectedCheck();
  };

  return {
    subscribe(cb) {
      subscribers.add(cb);
      if (!observer) start();
      // Initial pass so a subscriber sees a panel that is already open on
      // entry. Debounced with everything else, so two tools initialised in the
      // same tick share one dispatch.
      schedule();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(cb);
        if (subscribers.size === 0) stop();
      };
    },
    subscriberCount: () => subscribers.size,
    observedTarget: () => target,
  };
}

// The production hub, built lazily so importing this module in the node test
// environment does not touch `document` or `MutationObserver`.
let defaultHub: WidgetObserverHub | null = null;

function getDefaultHub(): WidgetObserverHub {
  if (!defaultHub) {
    defaultHub = createWidgetObserverHub<Document>({
      document: () => document,
      findWidget: (doc) => findMessagesWidget(doc),
      createObserver: (onRecords) => {
        const mo = new MutationObserver((records) => onRecords(records));
        return {
          // The hub hands back nodes it was given (body, the widget's parent),
          // which are real DOM nodes here; the structural type is for tests.
          observe: (target, init) => mo.observe(target as unknown as Node, init),
          disconnect: () => mo.disconnect(),
        };
      },
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
      onVisible: (fn) => {
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) fn();
        });
      },
    });
  }
  return defaultHub;
}

// Subscribe to "the Messages widget (or the page around it) changed". The
// callback is already debounced; run the sweep directly. Returns an
// unsubscribe function; the shared observer disconnects when the last
// subscriber leaves.
export function subscribeMessagesWidget(cb: () => void): () => void {
  return getDefaultHub().subscribe(cb);
}
