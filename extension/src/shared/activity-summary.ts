// Pure summary of "what the extension did" for the popup's Activity card. It only
// reads data the extension already keeps locally (accept ledger, desktop-app
// activity log, tool-breakage map); nothing new is recorded or sent anywhere.

import { isAutomaticCommand, type DesktopActivityEntry } from "./desktop-activity";

export type LedgerItemLike = { campaignId: string; at: number; source: "auto" | "manual" };
export type LedgerHistoryLike = { campaignId: string; at: number };
export type BreakageMap = Record<string, { lastAt?: number } | undefined>;

export type ActivityEventKind = "accepted-auto" | "accepted-manual" | "accepted" | "sent" | "send-failed" | "tool-problem";

export type ActivityEvent = {
  at: number;
  kind: ActivityEventKind;
  // Short, safe subject: the app action name, the tool name, or a campaign id.
  detail: string;
  count: number;
};

export type ActivityCounts = {
  accepted: number;
  acceptedAuto: number;
  sentToApp: number;
  failures: number;
};

export type ActivitySummary = { counts: ActivityCounts; events: ActivityEvent[] };

export const WINDOW_DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_WEEK_MS = 7 * WINDOW_DAY_MS;

export type ActivityInput = {
  ledgerItems: readonly LedgerItemLike[];
  ledgerHistory: readonly LedgerHistoryLike[];
  desktop: readonly DesktopActivityEntry[];
  breakage: BreakageMap;
  now: number;
  windowMs: number;
  limit?: number;
};

export function summarizeActivity(input: ActivityInput): ActivitySummary {
  const { now, windowMs } = input;
  const since = now - windowMs;
  const limit = input.limit ?? 10;
  const events: ActivityEvent[] = [];
  const counts: ActivityCounts = { accepted: 0, acceptedAuto: 0, sentToApp: 0, failures: 0 };

  // Accepts: the daily items know whether it was automatic; the rolling history
  // reaches back further but not who clicked, so those show as plain "accepted".
  const seen = new Set<string>();
  for (const item of input.ledgerItems) {
    if (item.at < since || item.at > now + 60_000) continue;
    seen.add(item.campaignId);
    counts.accepted += 1;
    if (item.source === "auto") counts.acceptedAuto += 1;
    events.push({
      at: item.at,
      kind: item.source === "auto" ? "accepted-auto" : "accepted-manual",
      detail: item.campaignId,
      count: 1,
    });
  }
  for (const h of input.ledgerHistory) {
    if (h.at < since || h.at > now + 60_000 || seen.has(h.campaignId)) continue;
    seen.add(h.campaignId);
    counts.accepted += 1;
    events.push({ at: h.at, kind: "accepted", detail: h.campaignId, count: 1 });
  }

  // The desktop-app log: successful sends and failed ones. Connection notes and
  // queued items are not "something done", so they are left out.
  for (const entry of input.desktop) {
    if (entry.at < since || entry.dir === "connection") continue;
    // Background reports the page sends on its own (nothing the creator asked
    // for) are not "problems" on this card, e.g. a storefront id push before
    // pairing was finished. They stay in the full log that support sees.
    if (entry.outcome === "failed" && isAutomaticCommand(entry.action)) continue;
    const times = Math.max(1, entry.count ?? 1);
    if (entry.dir === "to-app" && entry.outcome === "ok") {
      counts.sentToApp += times;
      events.push({ at: entry.at, kind: "sent", detail: entry.action, count: times });
    } else if (entry.outcome === "failed") {
      counts.failures += times;
      events.push({ at: entry.at, kind: "send-failed", detail: entry.action, count: times });
    }
  }

  // Tools that threw on a page recently.
  for (const [tool, info] of Object.entries(input.breakage)) {
    const at = info?.lastAt;
    if (typeof at !== "number" || at < since || at > now + 60_000) continue;
    counts.failures += 1;
    events.push({ at, kind: "tool-problem", detail: tool, count: 1 });
  }

  events.sort((a, b) => b.at - a.at);
  return { counts, events: events.slice(0, Math.max(0, limit)) };
}
