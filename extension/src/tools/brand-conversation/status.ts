// Where the creator stands with a product's brand, for the chip on product cards:
// "Messaged", "Brand responded", "You replied", "Brand messaged you". Built from the
// cached Creator Connections inbox (tools/cc-messages/inbox-cache) and, when the
// desktop app is paired, its Messenger Butler threads. Pure and DOM-free so the
// matching rules are unit-tested.

import { normalizeBrand } from "../brand-keywords/normalize";
import { cleanByline } from "./byline";
import type { MessengerRecord } from "../../transport/hud-commands";
import {
  conversationState,
  type ConversationState,
  type InboxCache,
  type StoredRow,
} from "../cc-messages/inbox-cache";

// A title-prefix match (Amazon titles start with the brand) is only trusted for
// brand keys at least this long, so a short generic brand ("Home", "Go") does not
// claim every product that happens to start with that word.
const MIN_TITLE_PREFIX_LEN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ConversationChip = {
  state: ConversationState;
  // The brand as the conversation names it.
  brand: string;
  label: string;
  tip: string;
  // Chip emphasis: a brand that wrote deserves a nudge; the rest stay quiet.
  tone: "good" | "plain";
  source: "inbox" | "app";
  // The desktop app holds a thread for this brand, so "Open in app" can work.
  inApp: boolean;
  lastAt: number;
};

export type CardRef = {
  // A brand name the page gave us (already cleaned), if any.
  brand?: string | null;
  // The product title, used to find a brand when none was given.
  title?: string | null;
};

const LABELS: Record<ConversationState, string> = {
  "brand-responded": "Brand responded",
  inbound: "Brand messaged you",
  "you-replied": "You replied",
  messaged: "Messaged",
  conversation: "In your inbox",
};

type Candidate = { key: string; row: StoredRow; source: "inbox" | "app"; inApp: boolean };

export function desktopToRow(rec: MessengerRecord): StoredRow {
  return {
    brand: rec.brand,
    token: "",
    lastMsgAt: rec.lastAt,
    unread: rec.unread,
    lastSender: rec.lastSender,
    checkedFor: rec.lastAt,
    brandReplied: rec.brandReplied,
    iMessaged: rec.iMessaged,
  };
}

function relativeAge(ms: number, now: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const days = Math.floor((now - ms) / DAY_MS);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  try {
    return `on ${new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
  } catch {
    return "";
  }
}

export function chipFor(candidate: Candidate, now: number): ConversationChip {
  const state = conversationState(candidate.row);
  const label = LABELS[state];
  const when = relativeAge(candidate.row.lastMsgAt, now);
  const tip = when ? `${label}: ${candidate.row.brand}, last message ${when}` : `${label}: ${candidate.row.brand}`;
  return {
    state,
    brand: candidate.row.brand,
    label,
    tip,
    tone: state === "brand-responded" || state === "inbound" ? "good" : "plain",
    source: candidate.source,
    inApp: candidate.inApp,
    lastAt: candidate.row.lastMsgAt,
  };
}

export type ConversationLookup = {
  // The chip for a product card, or null when there is no conversation.
  resolve(card: CardRef, now?: number): ConversationChip | null;
  size: number;
};

// Build the matcher once per page from the cache and the app's records.
export function createConversationLookup(inbox: InboxCache, desktop: MessengerRecord[] = []): ConversationLookup {
  const byKey = new Map<string, Candidate>();
  const loose = new Map<string, string>();

  const consider = (key: string, row: StoredRow, source: "inbox" | "app", inApp: boolean): void => {
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      // Keep whichever side saw the conversation more recently (ties favour the
      // inbox, the fresher read of Amazon's own data); remember the app has it too.
      const either = existing.inApp || inApp;
      if (row.lastMsgAt > existing.row.lastMsgAt) byKey.set(key, { key, row, source, inApp: either });
      else byKey.set(key, { ...existing, inApp: either });
      return;
    }
    byKey.set(key, { key, row, source, inApp });
  };

  for (const [key, row] of Object.entries(inbox.rows)) consider(key, row, "inbox", false);
  for (const rec of desktop) {
    const key = normalizeBrand(rec.brand);
    consider(key, desktopToRow(rec), "app", true);
  }
  for (const key of byKey.keys()) loose.set(key.replace(/\s+/g, ""), key);
  // Longest first, so "Michael Todd Beauty" beats a shorter "Michael" brand.
  const prefixKeys = Array.from(byKey.keys())
    .filter((k) => k.replace(/\s+/g, "").length >= MIN_TITLE_PREFIX_LEN)
    .sort((a, b) => b.length - a.length);

  const find = (card: CardRef): Candidate | null => {
    // A page byline ("Visit the Ghostek Store") is reduced to the bare brand.
    const brand = card.brand ? normalizeBrand(cleanByline(card.brand) ?? "") : "";
    if (brand) {
      const hit = byKey.get(brand) ?? byKey.get(loose.get(brand.replace(/\s+/g, "")) ?? "");
      if (hit) return hit;
    }
    const title = card.title ? normalizeBrand(card.title) : "";
    if (title) {
      const padded = `${title} `;
      for (const key of prefixKeys) {
        if (padded.startsWith(`${key} `)) return byKey.get(key) ?? null;
      }
    }
    return null;
  };

  return {
    size: byKey.size,
    resolve(card, now = Date.now()) {
      const candidate = find(card);
      return candidate ? chipFor(candidate, now) : null;
    },
  };
}
