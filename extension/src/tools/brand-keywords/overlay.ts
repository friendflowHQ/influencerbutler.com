import { log } from "../../shared/log";
import {
  sendToBackground,
  type BrandEnrichmentResult,
  type OutreachKeywordsResult,
} from "../../shared/messages";
import {
  buildEnrichmentMap,
  buildMaps,
  hasEnrichmentSignal,
  lookupBrand,
  lookupKeyword,
  normalizeBrand,
} from "./normalize";
import {
  mountRowChip,
  mountRowEnrichmentChip,
  mountThreadChip,
  mountThreadEnrichmentChip,
} from "./chip";
import {
  findConversationRows,
  findMessagesWidget,
  findThreadHeader,
  readListRowBrand,
  readThreadBrand,
} from "./selectors";
import type { BrandEnrichmentRecord, EnrichmentMap, OutreachMap, OutreachRecord } from "./types";
import type { Settings } from "../../storage/schema";

// Brand Keywords: badge each Creator Connections Messages conversation with a
// chip. A brand the creator *pitched* through the desktop "Message Brands" tool
// gets the search keyword it was found under (the orange keyword chip). A brand
// that only messaged the creator (an *inbound* opportunity the creator never
// pitched) instead gets a Creator Connections signal chip: best commission rate
// plus a cadence word, resolved from the app's global brand index. The Messages
// widget is a floating panel that mounts, unmounts, and toggles between a list
// and a thread on the same /p/connect/* route, so this owns a scoped
// MutationObserver rather than hanging off a page type.

// Marks a decorated (or checked-and-unmatched) row/header so a re-render or a
// later sweep does not re-query it. Mirrors campaign-radar's data-ib-radar.
const DONE_ATTR = "data-ib-bkw";
const HOST_CLASS = "bkw-chip-host";
// Coalesce React's burst of mutations into one sweep.
const SWEEP_DEBOUNCE_MS = 250;
// Do not refetch the ledger (or retry a failed enrichment fetch) more often than
// this when the panel is reopened.
const REFETCH_THROTTLE_MS = 60_000;

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
// Bumped on every init so a sweep that awaited a fetch across an SPA re-entry
// can tell it lost and bail before touching the new page's DOM.
let epoch = 0;

let outreachMap: OutreachMap | null = null;
let lastOutreachFetchAt = 0;

// Accumulated inbound-brand enrichment. `enrichmentRecords` is every record with
// a signal we have received so far; `enrichmentMap` is the lookup rebuilt from
// it. `enrichedBrands` records every normalized brand we have already asked the
// app about (hit or miss), so an unknown inbound brand is not requested again.
let enrichmentRecords: BrandEnrichmentRecord[] = [];
let enrichmentMap: EnrichmentMap = { exact: new Map(), loose: new Map() };
const enrichedBrands = new Set<string>();
// When the app is closed or unpaired the enrichment fetch fails; back off so we
// do not hammer the bridge on every mutation burst.
let enrichBackoffUntil = 0;

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
  // Drop the accumulated enrichment so a fresh page starts clean (the outreach
  // map is re-fetched by its own throttle).
  enrichmentRecords = [];
  enrichmentMap = { exact: new Map(), loose: new Map() };
  enrichedBrands.clear();
  enrichBackoffUntil = 0;
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
  if (!widget) {
    log("brand-keywords", "no messages widget");
    return; // panel closed; nothing to decorate
  }

  // 1. Outreach ledger: refreshed at most once per throttle window.
  if (outreachMap === null || Date.now() - lastOutreachFetchAt > REFETCH_THROTTLE_MS) {
    const res = await sendToBackground<OutreachKeywordsResult>({ kind: "FETCH_OUTREACH_KEYWORDS" });
    if (myEpoch !== epoch) return; // lost to a newer init while awaiting
    outreachMap = buildMaps(res?.ok ? res.records : []);
    lastOutreachFetchAt = Date.now();
    log("brand-keywords", "outreach fetch", {
      ok: res?.ok === true,
      paired: res?.paired !== false,
      records: res?.records?.length ?? 0,
      mapped: outreachMap.exact.size,
    });
  }

  // 2. Paint every conversation we can resolve now; collect the inbound brands
  //    still awaiting an enrichment lookup.
  const pending = decorate(widget, outreachMap, enrichmentMap);
  log("brand-keywords", "decorate", { pending: pending.length });
  if (pending.length === 0) return;

  // 3. Enrichment: request only brands we have not already looked up. A recent
  //    failure (app closed / unpaired) backs off; a success lets newly-scrolled
  //    brands fetch immediately (dedup by enrichedBrands stops repeats).
  const toFetch = pending.filter((brand) => !enrichedBrands.has(normalizeBrand(brand)));
  if (toFetch.length === 0) return;
  if (Date.now() < enrichBackoffUntil) return;

  const res = await sendToBackground<BrandEnrichmentResult>({
    kind: "FETCH_BRAND_ENRICHMENT",
    brands: toFetch,
  });
  if (myEpoch !== epoch) return;
  log("brand-keywords", "enrichment fetch", {
    ok: res?.ok === true,
    paired: res?.paired !== false,
    requested: toFetch.length,
    records: res?.records?.length ?? 0,
  });
  if (!res?.ok) {
    // App not answering: retry after the throttle window, do not remember misses.
    enrichBackoffUntil = Date.now() + REFETCH_THROTTLE_MS;
    return;
  }
  // Remember every requested brand (hit or miss) so we never ask twice.
  for (const brand of toFetch) enrichedBrands.add(normalizeBrand(brand));
  enrichmentRecords.push(...res.records.filter((r) => r && hasEnrichmentSignal(r)));
  enrichmentMap = buildEnrichmentMap(enrichmentRecords);
  // Re-run to paint the brands the fetch just resolved.
  decorate(widget, outreachMap, enrichmentMap);
}

// Decorate every conversation row and the open thread header. A row resolves to
// its keyword chip first (most specific), then an inbound enrichment chip. A row
// that matches neither and has already been looked up is marked done (nothing to
// show); one still awaiting a lookup is left unmarked and returned so the caller
// can fetch it. Returns the display names of those pending brands (deduped).
function decorate(widget: HTMLElement, oMap: OutreachMap, eMap: EnrichmentMap): string[] {
  const pending = new Set<string>();
  for (const row of findConversationRows(widget)) {
    if (row.hasAttribute(DONE_ATTR)) continue;
    const brand = readListRowBrand(row);
    if (!brand) {
      row.setAttribute(DONE_ATTR, "1"); // no brand text: never matchable
      continue;
    }
    if (resolveAnchor(row, brand, oMap, eMap, mountRowChip, mountRowEnrichmentChip)) continue;
    pending.add(brand);
  }

  const header = findThreadHeader(widget);
  if (header && !header.hasAttribute(DONE_ATTR)) {
    const brand = readThreadBrand(header);
    if (!brand) {
      header.setAttribute(DONE_ATTR, "1");
    } else if (!resolveAnchor(header, brand, oMap, eMap, mountThreadChip, mountThreadEnrichmentChip)) {
      pending.add(brand);
    }
  }

  return Array.from(pending);
}

// Try to mount a chip on one anchor (a row or the thread header). Returns true
// when the anchor is finished (a chip was mounted, or it was a confirmed miss),
// leaving it marked done; false when it is still awaiting an enrichment lookup.
function resolveAnchor(
  anchor: HTMLElement,
  brand: string,
  oMap: OutreachMap,
  eMap: EnrichmentMap,
  mountKeyword: (anchor: HTMLElement, record: OutreachRecord) => void,
  mountEnrichment: (anchor: HTMLElement, record: BrandEnrichmentRecord) => void,
): boolean {
  const keyword = lookupKeyword(oMap, brand);
  if (keyword) {
    anchor.setAttribute(DONE_ATTR, "1");
    mountKeyword(anchor, keyword);
    return true;
  }
  const enrichment = lookupBrand(eMap, brand);
  if (enrichment) {
    anchor.setAttribute(DONE_ATTR, "1");
    mountEnrichment(anchor, enrichment);
    return true;
  }
  // No match. If we have already asked the app about this brand, it is a
  // confirmed miss: mark done so it is not rechecked. Otherwise leave it for the
  // caller to fetch.
  if (enrichedBrands.has(normalizeBrand(brand))) {
    anchor.setAttribute(DONE_ATTR, "1");
    return true;
  }
  return false;
}
