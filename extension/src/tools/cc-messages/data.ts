// The data side of the Messages drawer cards: the brand-keyed campaign index
// (persisted so the drawer has data even when it is opened before the grid has
// loaded), the feeds that fill it (the rendered campaign grid, plus the MAIN-world
// hook's campaign records and fill counts), the accepted-campaign ledger, and the
// per-brand notes. No desktop app is needed for any of it.

import { readCampaignGridByTestId } from "../../amazon/creator-campaigns";
import { log } from "../../shared/log";
import { sendToBackground, type AcceptLedgerView } from "../../shared/messages";
import {
  applyFills,
  mergeCampaigns,
  pruneIndex,
  type BrandIndex,
  type CampaignFillLite,
  type IncomingCampaign,
} from "./brand-index";
import { normalizeBrandNotes, type BrandNotes } from "./notes";

const INDEX_KEY = "ib-cc-brand-index";
const NOTES_KEY = "ib-cc-brand-notes";
const FILTER_KEY = "ib-ccm-filter";
const PERSIST_DEBOUNCE_MS = 1500;
const LEDGER_THROTTLE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

let index: BrandIndex = {};
let notes: BrandNotes = {};
let accepted = new Set<string>();
let lastLedgerAt = 0;
let lastGridSignature = "";
let persistTimer: number | null = null;
let onChange: (() => void) | null = null;
let stopFeeds: (() => void) | null = null;

export function getIndex(): BrandIndex {
  return index;
}

export function getNotes(): BrandNotes {
  return notes;
}

export function isAccepted(campaignId: string | null): boolean {
  return !!campaignId && accepted.has(campaignId);
}

// ── persistence ──────────────────────────────────────────────────────────────

export async function loadStored(): Promise<void> {
  try {
    const got = await chrome.storage.local.get([INDEX_KEY, NOTES_KEY]);
    const stored = got?.[INDEX_KEY];
    if (stored && typeof stored === "object") {
      // Merge rather than replace: a feed may have landed while this awaited.
      index = pruneIndex({ ...(stored as BrandIndex), ...index }, Date.now());
    }
    notes = { ...normalizeBrandNotes(got?.[NOTES_KEY]), ...notes };
  } catch (error) {
    log("cc-messages", "load stored failed", error);
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    index = pruneIndex(index, Date.now());
    void chrome.storage.local.set({ [INDEX_KEY]: index }).catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

export async function saveNotes(next: BrandNotes): Promise<void> {
  notes = next;
  try {
    await chrome.storage.local.set({ [NOTES_KEY]: next });
  } catch (error) {
    log("cc-messages", "save notes failed", error);
  }
}

export async function readSavedFilter(): Promise<string | null> {
  try {
    const got = await chrome.storage.local.get(FILTER_KEY);
    const value = got?.[FILTER_KEY];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function saveFilter(filter: string): void {
  void chrome.storage.local.set({ [FILTER_KEY]: filter }).catch(() => undefined);
}

// ── feeds ────────────────────────────────────────────────────────────────────

function changed(): void {
  schedulePersist();
  onChange?.();
}

// A campaign end date from the grid card is a calendar date at local midnight;
// the campaign runs through that day, so count it as end-of-day.
function endOfDay(date: Date | null): number | null {
  if (!date) return null;
  const ms = date.getTime();
  if (!isFinite(ms)) return null;
  const isMidnight = date.getHours() === 0 && date.getMinutes() === 0;
  return isMidnight ? ms + DAY_MS - 1 : ms;
}

// Read the rendered campaign grid (when this page has one) into the index. Cheap
// to call on every sweep: it only merges when the grid's content changed.
export function mergeGrid(): void {
  let cards;
  try {
    cards = readCampaignGridByTestId(document);
  } catch {
    return;
  }
  const incoming: IncomingCampaign[] = [];
  for (const c of cards) {
    if (c.isSpcc || !c.brand) continue;
    incoming.push({
      brand: c.brand,
      campaignId: c.campaignId,
      ratePct: c.commissionRatePct,
      endsAt: endOfDay(c.endsAt),
      accepted: c.slotsFilled,
      required: c.slotsTotal,
      fullyClaimed: c.fullyClaimed,
      source: "grid",
    });
  }
  if (incoming.length === 0) return;
  const signature = incoming
    .map((r) => `${r.brand}|${r.campaignId}|${r.ratePct}|${r.endsAt}|${r.accepted}|${r.required}`)
    .join("~");
  if (signature === lastGridSignature) return;
  lastGridSignature = signature;
  index = mergeCampaigns(index, incoming, Date.now());
  log("cc-messages", "grid merged", { cards: incoming.length, brands: Object.keys(index).length });
  changed();
}

type HookRecord = { campaignId?: unknown; brand?: unknown; ratePct?: unknown; endsAt?: unknown };

function onHookRecords(event: Event): void {
  const records = (event as CustomEvent<{ records?: unknown }>).detail?.records;
  if (!Array.isArray(records)) return;
  const incoming: IncomingCampaign[] = [];
  for (const r of records as HookRecord[]) {
    if (!r || typeof r.brand !== "string") continue;
    incoming.push({
      brand: r.brand,
      campaignId: typeof r.campaignId === "string" ? r.campaignId : null,
      ratePct: typeof r.ratePct === "number" ? r.ratePct : null,
      endsAt: typeof r.endsAt === "number" ? r.endsAt : null,
      source: "api",
    });
  }
  if (incoming.length === 0) return;
  index = mergeCampaigns(index, incoming, Date.now());
  log("cc-messages", "api records merged", { records: incoming.length });
  changed();
}

function onHookFills(event: Event): void {
  const fills = (event as CustomEvent<{ fills?: unknown }>).detail?.fills;
  if (!fills || typeof fills !== "object") return;
  const next = applyFills(index, fills as Record<string, CampaignFillLite>);
  if (next === index) return;
  index = next;
  changed();
}

// Listen for the connect-hook's brand records and fill counts. `notify` runs
// after the index changes (the overlay re-sweeps). Returns a stop function.
export function startFeeds(notify: () => void): () => void {
  stopFeeds?.();
  onChange = notify;
  document.addEventListener("ib-ext-campaign-records", onHookRecords);
  document.addEventListener("ib-ext-campaign-fill", onHookFills);
  stopFeeds = () => {
    document.removeEventListener("ib-ext-campaign-records", onHookRecords);
    document.removeEventListener("ib-ext-campaign-fill", onHookFills);
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer);
      persistTimer = null;
    }
    onChange = null;
    stopFeeds = null;
  };
  return stopFeeds;
}

// The campaigns the creator has already accepted (ids), from the accept ledger,
// refreshed at most once a minute.
export async function refreshLedger(): Promise<boolean> {
  if (Date.now() - lastLedgerAt < LEDGER_THROTTLE_MS) return false;
  lastLedgerAt = Date.now();
  try {
    const view = await sendToBackground<AcceptLedgerView>({ kind: "GET_ACCEPT_LEDGER" });
    const ids = new Set<string>();
    for (const item of view?.items ?? []) ids.add(item.campaignId);
    for (const item of view?.history ?? []) ids.add(item.campaignId);
    const grew = ids.size !== accepted.size;
    accepted = ids;
    return grew;
  } catch {
    return false;
  }
}

// Mark a campaign accepted right after the creator accepts it from the card.
export function noteAccepted(campaignId: string): void {
  accepted = new Set(accepted).add(campaignId);
}

export function resetData(): void {
  index = {};
  notes = {};
  accepted = new Set();
  lastLedgerAt = 0;
  lastGridSignature = "";
}
