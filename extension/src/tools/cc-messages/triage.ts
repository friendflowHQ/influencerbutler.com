// Inbox triage for the Messages drawer's conversation list: which rows each
// filter keeps. Pure so it is unit-tested; the DOM layer only hides and restores
// rows based on these answers.

import type { ConversationState } from "./inbox-cache";

export type TriageFilter = "all" | "unread" | "replied" | "waiting" | "live" | "pitched" | "highrate";

export const TRIAGE_FILTERS: readonly TriageFilter[] = [
  "all",
  "unread",
  "replied",
  "waiting",
  "live",
  "pitched",
  "highrate",
];

// "High rate" threshold, in percent. Creator Connections rates mostly sit in the
// single digits, so 10%+ is worth a look.
export const HIGH_RATE_PCT = 10;

export type RowFacts = {
  // Amazon's own red unread dot is on the row, or the inbox read says unread.
  unread: boolean;
  // The brand has at least one live campaign we know about.
  live: boolean;
  // The creator pitched this brand through the desktop Message Brands tool.
  pitched: boolean;
  ratePct: number | null;
  // Who spoke last, from the inbox read; null when there is no inbox row for it.
  state: ConversationState | null;
};

export function matchesFilter(filter: TriageFilter, facts: RowFacts): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return facts.unread;
    case "replied":
      // The brand has written in this conversation (whoever spoke last).
      return facts.state === "brand-responded" || facts.state === "you-replied" || facts.state === "inbound";
    case "waiting":
      // The creator wrote and the brand has not answered yet.
      return facts.state === "messaged";
    case "live":
      return facts.live;
    case "pitched":
      return facts.pitched;
    case "highrate":
      return facts.ratePct !== null && facts.ratePct >= HIGH_RATE_PCT;
  }
}

// Amazon marks an unread conversation with a small solid red dot and exposes no
// attribute for it, so the DOM layer reads each small round element's computed
// background and asks this whether it is "red enough". Accepts the `rgb()` /
// `rgba()` strings getComputedStyle returns.
export function isUnreadDotColor(color: string): boolean {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(color.trim());
  if (!m) return false;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  return alpha > 0.5 && r >= 170 && g <= 70 && b <= 70;
}

export function isTriageFilter(value: unknown): value is TriageFilter {
  return typeof value === "string" && (TRIAGE_FILTERS as readonly string[]).includes(value);
}

// How many of `rows` a filter keeps, for the chip counts.
export function countMatches(filter: TriageFilter, rows: RowFacts[]): number {
  return rows.filter((row) => matchesFilter(filter, row)).length;
}
