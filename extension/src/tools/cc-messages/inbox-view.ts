// Joins what the drawer actually shows (at most 100 rows) with the full inbox read
// from the chat API, so the filter bar's counts describe the whole inbox and the
// conversations Amazon's drawer leaves out can be listed. Pure so it is unit-tested.

import { normalizeBrand } from "../brand-keywords/normalize";
import { conversationState, needsThreadCheck, type InboxCache, type StoredRow } from "./inbox-cache";
import type { RowFacts } from "./triage";

// How many off-drawer conversations the "older" list shows at first, and how many
// each "Show more" adds.
export const MAX_MORE_ITEMS = 100;
export const MORE_STEP = 100;

export type DomFact = { brandKey: string; facts: RowFacts };

export type MoreItem = {
  brandKey: string;
  brand: string;
  lastMsgAt: number;
  unread: boolean;
  facts: RowFacts;
};

export type InboxView = {
  // Every conversation: the drawer's rows plus the ones it does not show.
  all: RowFacts[];
  // Conversations missing from the drawer, newest first (uncapped).
  extras: MoreItem[];
};

// `makeFacts` computes a conversation's facts from its brand (live campaign,
// pitched, rate); the inbox row supplies unread and who-spoke-last. A query
// (see matchesQuery) narrows both the drawer rows and the extras before anything
// is counted, so the chip numbers always describe what is on screen.
export function buildInboxView(
  dom: DomFact[],
  inbox: InboxCache,
  makeFacts: (brand: string, row: StoredRow) => RowFacts,
  query = "",
): InboxView {
  const shown = new Set(dom.map((d) => d.brandKey));
  const extras: MoreItem[] = [];
  for (const [brandKey, row] of Object.entries(inbox.rows) as Array<[string, StoredRow]>) {
    if (shown.has(brandKey)) continue;
    if (!matchesQuery(brandKey, query)) continue;
    extras.push({
      brandKey,
      brand: row.brand,
      lastMsgAt: row.lastMsgAt,
      unread: row.unread,
      facts: makeFacts(row.brand, row),
    });
  }
  extras.sort((a, b) => b.lastMsgAt - a.lastMsgAt);
  const kept = dom.filter((d) => matchesQuery(d.brandKey, query));
  return { all: [...kept.map((d) => d.facts), ...extras.map((e) => e.facts)], extras };
}

// The off-drawer conversations the active filter keeps, capped for display, plus
// how many were cut.
export function visibleExtras(
  extras: MoreItem[],
  keep: (facts: RowFacts) => boolean,
  cap: number = MAX_MORE_ITEMS,
): { items: MoreItem[]; hidden: number } {
  const matching = extras.filter((e) => keep(e.facts));
  return { items: matching.slice(0, cap), hidden: Math.max(0, matching.length - cap) };
}

// Whether a brand key matches what the creator typed in the search box: the
// normalized query as a substring, or with all whitespace stripped on both sides
// ("kkamerio" finds "K KAMERIO"). An empty query matches everything.
export function matchesQuery(brandKey: string, query: string): boolean {
  const q = normalizeBrand(query);
  if (!q) return true;
  if (brandKey.includes(q)) return true;
  return brandKey.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
}

// Unread and who-spoke-last for one inbox row, for a RowFacts.
export function inboxFacts(row: StoredRow | undefined): { unread: boolean; state: RowFacts["state"] } {
  if (!row) return { unread: false, state: null };
  return { unread: row.unread, state: conversationState(row) };
}

// How far the background thread reads have got, for the "N of M checked" line.
export function threadProgress(inbox: InboxCache): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  for (const row of Object.values(inbox.rows)) {
    total += 1;
    if (!needsThreadCheck(row)) checked += 1;
  }
  return { checked, total };
}
