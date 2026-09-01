import { log } from "../../shared/log";
import { sendToBackground, type TemplatesLookupResult } from "../../shared/messages";
import type { DesktopTemplate } from "../../transport/hud-commands";
import type { Settings } from "../../storage/schema";
import { findComposer, findMessagesWidget, findThreadHeader, readThreadBrand } from "./selectors";
import { buildToolbar, HOST_CLASS, type ToolbarContext } from "./toolbar";

// Message Templates: a Save + one-click "load a template into the message"
// toolbar on the Creator Connections Messages composer. Saves templates locally
// and merges in the desktop app's own templates (read over the bridge) so both
// sides share one library. Like Brand Keywords, this lives on the same floating
// Messages widget that mounts, unmounts, and toggles between a list and a thread
// on the /p/connect/* route, so it owns a scoped MutationObserver rather than
// hanging off a page type, and is torn down explicitly on every SPA navigation.

// Coalesce React's burst of mutations into one sweep.
const SWEEP_DEBOUNCE_MS = 250;
// Do not refetch the desktop template store more often than this when the panel
// is reopened (the picker reads the cached copy each time it opens).
const REFETCH_THROTTLE_MS = 60_000;

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
// Bumped on every init so a sweep that awaited the bridge across an SPA re-entry
// can tell it lost and bail before touching the new page's DOM.
let epoch = 0;

// The desktop template store, cached from the last successful bridge fetch and
// read lazily by the toolbar when its picker opens.
let desktopTemplates: DesktopTemplate[] = [];
let desktopValues: Record<string, string> = {};
let desktopPaired = false;
let lastFetchAt = 0;

export function initMessageTemplates(_settings: Settings): void {
  teardownMessageTemplates();
  const myEpoch = ++epoch;
  observer = new MutationObserver(() => scheduleSweep(myEpoch));
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleSweep(myEpoch);
}

export function teardownMessageTemplates(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  epoch += 1;
  desktopTemplates = [];
  desktopValues = {};
  desktopPaired = false;
  lastFetchAt = 0;
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
}

function scheduleSweep(myEpoch: number): void {
  if (debounceTimer !== null) return;
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    if (myEpoch !== epoch) return;
    void sweep(myEpoch).catch((error) => log("message-templates", "sweep failed", error));
  }, SWEEP_DEBOUNCE_MS);
}

async function sweep(myEpoch: number): Promise<void> {
  const widget = findMessagesWidget(document);
  if (!widget) return; // panel closed; nothing to mount

  // Mount the toolbar immediately: local templates need no bridge, so the tool
  // is useful even with the desktop app closed.
  mountToolbar(widget);

  // Refresh the desktop template cache at most once per throttle window. The
  // toolbar reads whatever is cached when its picker opens, so a fetch that
  // lands after mount simply enriches the next open.
  if (Date.now() - lastFetchAt > REFETCH_THROTTLE_MS) {
    lastFetchAt = Date.now();
    const res = await sendToBackground<TemplatesLookupResult>({ kind: "FETCH_MESSAGE_TEMPLATES" });
    if (myEpoch !== epoch) return; // lost to a newer init while awaiting
    desktopPaired = res?.paired !== false;
    desktopTemplates = res?.ok ? res.templates : [];
    desktopValues = res?.ok && res.values ? res.values : {};
    log("message-templates", "templates fetch", {
      ok: res?.ok === true,
      paired: desktopPaired,
      templates: desktopTemplates.length,
    });
  }
}

function mountToolbar(widget: HTMLElement): void {
  if (widget.querySelector(`.${HOST_CLASS}`)) return; // already mounted
  const composer = findComposer(widget);
  if (!composer) return; // list view (no open thread) has no composer

  const ctx: ToolbarContext = {
    // Re-resolve on every action: React re-renders can swap the composer node
    // and change which thread (brand) is open between mount and click.
    resolveComposer: () => {
      const w = findMessagesWidget(document);
      return w ? findComposer(w) : null;
    },
    resolveBrand: () => {
      const w = findMessagesWidget(document);
      const header = w ? findThreadHeader(w) : null;
      return header ? readThreadBrand(header) : null;
    },
    getDesktop: () => ({ templates: desktopTemplates, values: desktopValues, paired: desktopPaired }),
  };

  const host = buildToolbar(ctx);
  composer.parentElement?.insertBefore(host, composer);
}
