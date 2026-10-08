import { log } from "../../shared/log";
import { sendToBackground } from "../../shared/messages";
import type { MessengerLookupResult, MessengerRecord } from "../../transport/hud-commands";
import { EMPTY_CACHE, INBOX_KEY, normalizeCache, type InboxCache } from "../cc-messages/inbox-cache";
import { createConversationLookup, type ConversationLookup } from "./status";

// Loads what the chips need, on any page: the persisted Creator Connections inbox
// (written by the Messages tools whenever a CC page is open) and, when the desktop
// app is paired and running, its Messenger Butler threads. Resolves to null when
// there is nothing to chip, so a creator with no conversations sees nothing. The
// result is shared for a minute so several overlays on one page ask once.

const REUSE_MS = 60_000;

let cached: { at: number; lookup: ConversationLookup | null } | null = null;
let inflight: Promise<ConversationLookup | null> | null = null;

async function readInbox(): Promise<InboxCache> {
  try {
    const got = await chrome.storage.local.get(INBOX_KEY);
    return normalizeCache(got?.[INBOX_KEY]);
  } catch {
    return EMPTY_CACHE;
  }
}

async function readDesktop(): Promise<MessengerRecord[]> {
  try {
    // Answers instantly (no socket) when the app was never paired.
    const res = await sendToBackground<MessengerLookupResult>({ kind: "FETCH_MESSENGER_STATUS" });
    return res?.ok && Array.isArray(res.records) ? res.records : [];
  } catch {
    return [];
  }
}

export function loadConversationLookup(): Promise<ConversationLookup | null> {
  if (cached && Date.now() - cached.at < REUSE_MS) return Promise.resolve(cached.lookup);
  if (inflight) return inflight;
  inflight = (async () => {
    const [inbox, desktop] = await Promise.all([readInbox(), readDesktop()]);
    const lookup = createConversationLookup(inbox, desktop);
    const result = lookup.size > 0 ? lookup : null;
    cached = { at: Date.now(), lookup: result };
    log("brand-conversation", "loaded", { conversations: lookup.size, app: desktop.length });
    return result;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function resetConversationLookup(): void {
  cached = null;
  inflight = null;
}
