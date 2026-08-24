import { log } from "../../shared/log";
import { sendToBackground, type OutreachKeywordsResult } from "../../shared/messages";
import { buildMaps, lookupKeyword } from "./normalize";
import { mountRowChip, mountThreadChip } from "./chip";
import {
  findConversationRows,
  findMessagesWidget,
  findThreadHeader,
  readListRowBrand,
  readThreadBrand,
} from "./selectors";
import type { OutreachMap } from "./types";
import type { Settings } from "../../storage/schema";

// Brand Keywords: badge each Creator Connections Messages conversation with the
// search keyword the desktop "Message Brands" tool used to find that brand. The
// Messages widget is a floating panel that mounts, unmounts, and toggles between
// a conversation list and a thread on the same /p/connect/* route, so this owns
// a scoped MutationObserver rather than hanging off a page type. Self-gates to
// paired users with outreach history: an empty map means zero DOM writes.

// Marks a decorated (or checked-and-unmatched) row/header so a re-render or a
// later sweep does not re-query it. Mirrors campaign-radar's data-ib-radar.
const DONE_ATTR = "data-ib-bkw";
const HOST_CLASS = "bkw-chip-host";
// Coalesce React's burst of mutations into one sweep.
const SWEEP_DEBOUNCE_MS = 250;
// Do not refetch the ledger more than this often when the panel is reopened.
const REFETCH_THROTTLE_MS = 60_000;

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
// Bumped on every init so a sweep that awaited the map fetch across an SPA
// re-entry can tell it lost and bail before touching the new page's DOM.
let epoch = 0;
let outreachMap: OutreachMap | null = null;
let lastFetchAt = 0;

export function initBrandKeywords(_settings: Settings): void {
  teardownBrandKeywords();
  const myEpoch = ++epoch;
  observer = new MutationObserver(() => scheduleSweep(myEpoch));
  observer.observe(document.body, { childList: true, subtree: true });
  // Initial pass in case the widget is already open on entry.
  scheduleSweep(myEpoch);
}

export function teardownBrandKeywords(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  // Bump the epoch so any in-flight sweep bails instead of decorating.
  epoch += 1;
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const node of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    node.removeAttribute(DONE_ATTR);
  }
}

function scheduleSweep(myEpoch: number): void {
  if (debounceTimer !== null) return;
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    if (myEpoch !== epoch) return;
    void sweep(myEpoch).catch((error) => log("brand-keywords", "sweep failed", error));
  }, SWEEP_DEBOUNCE_MS);
}

async function sweep(myEpoch: number): Promise<void> {
  const widget = findMessagesWidget(document);
  if (!widget) return; // panel closed; nothing to decorate

  if (outreachMap === null || Date.now() - lastFetchAt > REFETCH_THROTTLE_MS) {
    const res = await sendToBackground<OutreachKeywordsResult>({ kind: "FETCH_OUTREACH_KEYWORDS" });
    if (myEpoch !== epoch) return; // lost to a newer init while awaiting
    outreachMap = buildMaps(res?.ok ? res.records : []);
    lastFetchAt = Date.now();
  }
  if (outreachMap.exact.size === 0) return; // not paired / no outreach -> no-op

  decorateRows(widget, outreachMap);
  decorateThread(widget, outreachMap);
}

function decorateRows(widget: HTMLElement, map: OutreachMap): void {
  for (const row of findConversationRows(widget)) {
    if (row.hasAttribute(DONE_ATTR)) continue;
    row.setAttribute(DONE_ATTR, "1"); // mark first: an unmatched row is not re-checked
    const brand = readListRowBrand(row);
    if (!brand) continue;
    const record = lookupKeyword(map, brand);
    if (record) mountRowChip(row, record);
  }
}

function decorateThread(widget: HTMLElement, map: OutreachMap): void {
  const header = findThreadHeader(widget);
  if (!header || header.hasAttribute(DONE_ATTR)) return;
  header.setAttribute(DONE_ATTR, "1");
  const brand = readThreadBrand(header);
  if (!brand) return;
  const record = lookupKeyword(map, brand);
  if (record) mountThreadChip(header, record);
}
