// The persisted copy of the creator's full Messages inbox (built from
// inbox-api.ts) and the pure rules for keeping it fresh. Persisted under the bare
// chrome.storage.local key `ib-cc-inbox`, so a content script on ANY page (an
// Amazon search page, a product page) can answer "is there a conversation with
// this brand, and who spoke last?" without opening Creator Connections.
//
// Cheap fields (last message time, unread) come from one inbox call for every
// conversation. "Who wrote last" and "did the brand ever reply" need one request
// per thread, so those are fetched lazily, newest conversations first, and only
// again when a thread's last message time changes.

import type { InboxRow, ThreadStatus } from "./inbox-api";

export const INBOX_KEY = "ib-cc-inbox";
export const MAX_INBOX_ROWS = 5000;
// An inbox read older than this is stale for display purposes.
export const INBOX_STALE_MS = 24 * 60 * 60 * 1000;

export type StoredRow = {
  brand: string;
  token: string;
  lastMsgAt: number;
  unread: boolean;
  // From the thread read. null until the thread has been checked.
  lastSender: "me" | "brand" | null;
  // The lastMsgAt the thread read was taken at; the status is current only while
  // it equals lastMsgAt.
  checkedFor: number;
  // Sticky once true: a brand that has ever replied keeps that history.
  brandReplied: boolean;
  iMessaged: boolean;
};

export type InboxCache = {
  syncedAt: number;
  // Keyed by normalizeBrand(brand).
  rows: Record<string, StoredRow>;
};

export const EMPTY_CACHE: InboxCache = { syncedAt: 0, rows: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Defensive read of whatever chrome.storage held: drop anything malformed.
export function normalizeCache(raw: unknown): InboxCache {
  if (!isRecord(raw) || !isRecord(raw.rows)) return { syncedAt: 0, rows: {} };
  const rows: Record<string, StoredRow> = {};
  for (const [key, value] of Object.entries(raw.rows)) {
    if (!key || !isRecord(value) || typeof value.brand !== "string" || !value.brand) continue;
    rows[key] = {
      brand: value.brand,
      token: typeof value.token === "string" ? value.token : "",
      lastMsgAt: finiteNum(value.lastMsgAt),
      unread: value.unread === true,
      lastSender: value.lastSender === "me" || value.lastSender === "brand" ? value.lastSender : null,
      checkedFor: finiteNum(value.checkedFor),
      brandReplied: value.brandReplied === true,
      iMessaged: value.iMessaged === true,
    };
  }
  return { syncedAt: finiteNum(raw.syncedAt), rows };
}

// Fold a fresh inbox read into the cache. Conversations Amazon no longer lists
// are dropped; a conversation whose last message time is unchanged keeps its
// thread status, one that moved keeps only the sticky history and is re-queued.
export function mergeInbox(prev: InboxCache | null, fresh: InboxRow[], now: number): InboxCache {
  const old = prev?.rows ?? {};
  const rows: Record<string, StoredRow> = {};
  for (const row of fresh) {
    const existingFresh = rows[row.brandKey];
    // Two conversations folding to one brand key: keep the more recent.
    if (existingFresh && existingFresh.lastMsgAt >= row.lastMsgAt) continue;
    const before = old[row.brandKey];
    const same = !!before && before.lastMsgAt === row.lastMsgAt && before.checkedFor === row.lastMsgAt;
    rows[row.brandKey] = {
      brand: row.brand,
      token: row.token,
      lastMsgAt: row.lastMsgAt,
      unread: row.unread,
      lastSender: same ? before.lastSender : null,
      checkedFor: same ? before.checkedFor : 0,
      brandReplied: before?.brandReplied ?? false,
      iMessaged: before?.iMessaged ?? false,
    };
    if (Object.keys(rows).length >= MAX_INBOX_ROWS) break;
  }
  return { syncedAt: now, rows };
}

export function needsThreadCheck(row: StoredRow): boolean {
  return row.token !== "" && row.checkedFor !== row.lastMsgAt;
}

// The next conversations to read, newest first, at most `budget`.
export function pickThreadWork(cache: InboxCache, budget: number): Array<{ key: string; row: StoredRow }> {
  return Object.entries(cache.rows)
    .filter(([, row]) => needsThreadCheck(row))
    .sort((a, b) => b[1].lastMsgAt - a[1].lastMsgAt)
    .slice(0, Math.max(0, budget))
    .map(([key, row]) => ({ key, row }));
}

// Record one thread read. Ignored when the row has moved on since the read began
// (its last message time changed), so a stale answer never overwrites a newer one.
export function applyThreadStatus(
  cache: InboxCache,
  key: string,
  readAtLastMsg: number,
  status: ThreadStatus,
): InboxCache {
  const row = cache.rows[key];
  if (!row || row.lastMsgAt !== readAtLastMsg) return cache;
  return {
    ...cache,
    rows: {
      ...cache.rows,
      [key]: {
        ...row,
        lastSender: status.lastSender,
        checkedFor: readAtLastMsg,
        brandReplied: row.brandReplied || status.brandReplied,
        iMessaged: row.iMessaged || status.iMessaged,
      },
    },
  };
}

export function inboxCounts(cache: InboxCache): { total: number; unread: number } {
  let unread = 0;
  const all = Object.values(cache.rows);
  for (const row of all) if (row.unread) unread += 1;
  return { total: all.length, unread };
}

// What the creator's relationship with a brand looks like right now.
export type ConversationState =
  | "brand-responded" // I wrote, the brand wrote back (brand spoke last)
  | "inbound" // the brand wrote and I have never written
  | "you-replied" // the brand has written before and I spoke last
  | "messaged" // I wrote and the brand has not replied
  | "conversation"; // a conversation exists but who spoke is not known yet

export function conversationState(row: StoredRow): ConversationState {
  // Amazon marks a thread unread only when the newest message is not mine, so an
  // unread thread whose status has not been read yet is still "the brand spoke".
  const sender = row.checkedFor === row.lastMsgAt && row.lastSender ? row.lastSender : row.unread ? "brand" : null;
  if (sender === "brand") return row.iMessaged ? "brand-responded" : "inbound";
  if (sender === "me") return row.brandReplied ? "you-replied" : "messaged";
  return "conversation";
}
