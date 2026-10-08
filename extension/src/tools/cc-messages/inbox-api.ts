// The Creator Connections Messages inbox, read from Amazon's own chat JSON API
// instead of the drawer. The drawer renders at most 100 conversations (no "Load
// more"), so counting its rows caps every number at 100; the API returns the whole
// inbox. This is a port of the desktop app's Messenger Butler client
// (InfluencerButler repo: workspaces/messengerbutler/messenger-api-client.js) and
// its constants are copied from there on purpose: if Amazon changes the endpoint,
// fix both.
//
//   GET /connect/api/chat/get?maxSize=N
//       -> responses[0].addresses[*].addressBook[*]  (one row per brand
//          conversation: actorName, contextValidatorToken, lastMsgTimeStamp,
//          lastReadMsgTimeStamp)
//   GET /connect/api/chat/messages/list?actorId=&actorName=&contextToken=
//       -> responses[0].chatMessages[]  (newest first; sender.type CREATOR | BRAND)
//
// Both need the `storeid` request header the page's own app sends, or they 401.
// Everything here is pure and takes its fetch as a parameter, so it is unit-tested
// without a browser; inbox-store.ts supplies the real same-origin fetch.

import { normalizeBrand } from "../brand-keywords/normalize";

// /chat/get returns min(maxSize, trueTotal) in one page and its nextToken cursor
// is unreliable, so ask for one generous page and grow it only when a page comes
// back exactly full. Amazon also caps a single response well below the largest
// inboxes, so a full page at the ceiling may still be truncated.
export const INBOX_PAGE_SIZE = 2000;
export const MAX_INBOX_PAGE_SIZE = 20000;
const MAX_TOKEN_PAGES = 50;
// Amazon rate-limits /connect/api/chat/* aggressively.
export const RATE_LIMIT_MAX_RETRIES = 6;
export const RATE_LIMIT_BASE_DELAY_MS = 1500;
// A brand reply is looked for through at most this many pages of one thread.
const MAX_THREAD_PAGES = 5;

export type ApiResponseLike = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type ApiFetch = (
  url: string,
  init: { credentials: "include"; headers: Record<string, string> },
) => Promise<ApiResponseLike>;

export type ApiDeps = {
  fetchFn: ApiFetch;
  storeId: string;
  // Injected so tests do not wait; defaults to real timers.
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type InboxApiErrorCode = "session-expired" | "api-error";

export class InboxApiError extends Error {
  readonly code: InboxApiErrorCode;
  readonly status: number;
  constructor(code: InboxApiErrorCode, status: number, endpoint: string) {
    super(`${endpoint} returned HTTP ${status}`);
    this.name = "InboxApiError";
    this.code = code;
    this.status = status;
  }
}

export type InboxRow = {
  brand: string;
  // normalizeBrand(brand): the key every other Messages tool joins on.
  brandKey: string;
  // Amazon's per-conversation token, needed to read the thread.
  token: string;
  lastMsgAt: number;
  lastReadAt: number;
  unread: boolean;
};

export type ThreadStatus = {
  // Who wrote the newest message.
  lastSender: "me" | "brand" | null;
  lastAt: number;
  brandReplied: boolean;
  iMessaged: boolean;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function firstBlock(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  const responses = payload.responses;
  const first = Array.isArray(responses) ? responses[0] : null;
  return isRecord(first) ? first : {};
}

// ── retry / transport ────────────────────────────────────────────────────────

export function backoffDelayMs(attempt: number, retryAfterMs: number, random: () => number = Math.random): number {
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
  const exp = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  return exp + Math.floor(random() * 500);
}

async function getJson(deps: ApiDeps, path: string, params: URLSearchParams, endpoint: string): Promise<unknown> {
  const sleep = deps.sleep ?? defaultSleep;
  const headers: Record<string, string> = { accept: "application/json" };
  if (deps.storeId) headers.storeid = deps.storeId;
  let attempt = 0;
  for (;;) {
    const res = await deps.fetchFn(`${path}?${params.toString()}`, { credentials: "include", headers });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 503) && attempt < RATE_LIMIT_MAX_RETRIES) {
      attempt += 1;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(backoffDelayMs(attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, deps.random));
      continue;
    }
    const code: InboxApiErrorCode = res.status === 401 || res.status === 403 ? "session-expired" : "api-error";
    throw new InboxApiError(code, res.status, endpoint);
  }
}

// ── inbox ────────────────────────────────────────────────────────────────────

// Flatten one /chat/get block into its brand rows plus a continuation cursor
// (top level or per creator-actor, whichever Amazon sent).
export function parseInboxBlock(payload: unknown): { rows: unknown[]; nextToken: string | null } {
  const block = firstBlock(payload);
  const rows: unknown[] = [];
  let addrToken: string | null = null;
  const addresses = Array.isArray(block.addresses) ? block.addresses : [];
  for (const entry of addresses) {
    if (!isRecord(entry)) continue;
    if (Array.isArray(entry.addressBook)) rows.push(...entry.addressBook);
    if (!addrToken && typeof entry.nextToken === "string" && entry.nextToken) addrToken = entry.nextToken;
  }
  const top = typeof block.nextToken === "string" && block.nextToken ? block.nextToken : null;
  return { rows, nextToken: top ?? addrToken };
}

export function summariseInboxRow(raw: unknown): InboxRow | null {
  if (!isRecord(raw)) return null;
  const brand = str(raw.actorName).trim();
  if (!brand) return null;
  const brandKey = normalizeBrand(brand);
  if (!brandKey) return null;
  const lastMsgAt = num(raw.lastMsgTimeStamp);
  const lastReadAt = num(raw.lastReadMsgTimeStamp);
  return {
    brand,
    brandKey,
    token: str(raw.contextValidatorToken),
    lastMsgAt,
    lastReadAt,
    unread: lastMsgAt > lastReadAt,
  };
}

// One row per conversation: the token is unique per conversation, the normalized
// brand is the fallback when a row omits it.
function rowSignature(row: InboxRow): string {
  return row.token ? `t:${row.token}` : `n:${row.brandKey}`;
}

export async function fetchAllInboxRows(deps: ApiDeps): Promise<InboxRow[]> {
  const seen = new Set<string>();
  const out: InboxRow[] = [];
  const absorb = (rawRows: unknown[]): number => {
    let added = 0;
    for (const raw of rawRows) {
      const row = summariseInboxRow(raw);
      if (!row) continue;
      const sig = rowSignature(row);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(row);
      added += 1;
    }
    return added;
  };

  // Phase 1: one big page, doubled while it comes back exactly full.
  let size = INBOX_PAGE_SIZE;
  let token: string | null = null;
  for (;;) {
    const payload = await getJson(deps, "/connect/api/chat/get", new URLSearchParams({ maxSize: String(size) }), "chat/get");
    const flat = parseInboxBlock(payload);
    out.length = 0;
    seen.clear();
    absorb(flat.rows);
    token = flat.nextToken;
    const full = flat.rows.length >= size;
    if (!full || size >= MAX_INBOX_PAGE_SIZE) break;
    size = Math.min(size * 2, MAX_INBOX_PAGE_SIZE);
  }

  // Phase 2: follow a cursor if one was sent. A rejected cursor comes back as an
  // empty page, which ends the walk with what we have.
  for (let page = 0; token && page < MAX_TOKEN_PAGES; page += 1) {
    let flat: { rows: unknown[]; nextToken: string | null };
    try {
      const payload = await getJson(
        deps,
        "/connect/api/chat/get",
        new URLSearchParams({ maxSize: String(size), nextToken: token }),
        "chat/get",
      );
      flat = parseInboxBlock(payload);
    } catch {
      break;
    }
    if (flat.rows.length === 0 || absorb(flat.rows) === 0) break;
    if (!flat.nextToken || flat.nextToken === token) break;
    token = flat.nextToken;
  }
  return out;
}

// ── threads ──────────────────────────────────────────────────────────────────

type ThreadMessage = { who: "me" | "brand" | null; at: number };

export function parseThreadMessages(payload: unknown): { messages: ThreadMessage[]; nextToken: string | null } {
  const block = firstBlock(payload);
  const chat = Array.isArray(block.chatMessages) ? block.chatMessages : [];
  const messages: ThreadMessage[] = [];
  for (const raw of chat) {
    if (!isRecord(raw)) continue;
    const sender = isRecord(raw.sender) ? raw.sender : {};
    const type = str(sender.type).toUpperCase();
    messages.push({
      who: type === "CREATOR" ? "me" : type === "BRAND" ? "brand" : null,
      at: num(raw.createdTimestamp),
    });
  }
  const nextToken = typeof block.nextToken === "string" && block.nextToken ? block.nextToken : null;
  return { messages, nextToken };
}

export function summariseThread(messages: ThreadMessage[]): ThreadStatus {
  const known = messages.filter((m) => m.who !== null);
  let lastSender: ThreadStatus["lastSender"] = null;
  let lastAt = 0;
  for (const m of known) {
    if (m.at >= lastAt) {
      lastAt = m.at;
      lastSender = m.who;
    }
  }
  return {
    lastSender,
    lastAt,
    brandReplied: known.some((m) => m.who === "brand"),
    iMessaged: known.some((m) => m.who === "me"),
  };
}

// Read a thread just far enough to answer "who wrote last" and "did the brand ever
// reply": the newest page always, then older pages only while no brand message has
// turned up yet (capped), so a long one-sided pitch thread costs a few requests.
export async function fetchThreadStatus(
  deps: ApiDeps,
  thread: { actorId: string; brand: string; token: string },
): Promise<ThreadStatus> {
  const all: ThreadMessage[] = [];
  let nextToken: string | null = null;
  for (let page = 0; page < MAX_THREAD_PAGES; page += 1) {
    const params = new URLSearchParams({
      actorId: thread.actorId,
      actorName: thread.brand,
      contextToken: thread.token,
    });
    if (nextToken) params.set("nextToken", nextToken);
    const payload = await getJson(deps, "/connect/api/chat/messages/list", params, "chat/messages/list");
    const parsed = parseThreadMessages(payload);
    all.push(...parsed.messages);
    nextToken = parsed.nextToken;
    if (!nextToken || all.some((m) => m.who === "brand")) break;
  }
  return summariseThread(all);
}
