// Joins what the drawer actually shows (at most 100 rows) with the full inbox read
// from the chat API, so the filter bar's counts describe the whole inbox and the
// conversations Amazon's drawer leaves out can be listed. Pure so it is unit-tested.

import type { InboxCache, StoredRow } from "./inbox-cache";
import type { RowFacts } from "./triage";

// How many off-drawer conversations the "more" list shows at once.
export const MAX_MORE_ITEMS = 100;

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
// pitched, rate); the drawer's own unread dot wins for rows it shows, since it is
// current while the API copy can be a couple of minutes old.
export function buildInboxView(
  dom: DomFact[],
  inbox: InboxCache,
  makeFacts: (brand: string, unread: boolean) => RowFacts,
): InboxView {
  const shown = new Set(dom.map((d) => d.brandKey));
  const extras: MoreItem[] = [];
  for (const [brandKey, row] of Object.entries(inbox.rows) as Array<[string, StoredRow]>) {
    if (shown.has(brandKey)) continue;
    extras.push({
      brandKey,
      brand: row.brand,
      lastMsgAt: row.lastMsgAt,
      unread: row.unread,
      facts: makeFacts(row.brand, row.unread),
    });
  }
  extras.sort((a, b) => b.lastMsgAt - a.lastMsgAt);
  return { all: [...dom.map((d) => d.facts), ...extras.map((e) => e.facts)], extras };
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
