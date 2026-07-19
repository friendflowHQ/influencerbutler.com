/**
 * Pure derivation for the affiliate "Referred signups" funnel. Turns raw
 * profiles + subscriptions rows (already filtered to one referring affiliate)
 * into aggregate counts and an ANONYMOUS event feed: event type + timestamp
 * only, never ids, names, or emails. Kept free of IO so it can be unit-tested
 * directly; the /api/affiliates/referred-signups route does the reads.
 */

export type ReferredProfileRow = {
  created_at: string | null;
  ref_captured_at: string | null;
};

export type ReferredSubscriptionRow = {
  user_id: string | null;
  status: string | null;
  trial_started_at: string | null;
  trial_converted_at: string | null;
  pro_started_at: string | null;
  ends_at: string | null;
};

export type ReferredEventType =
  | "signup"
  | "trial_started"
  | "trial_converted"
  | "subscription_started"
  | "cancelled";

export type ReferredEvent = {
  type: ReferredEventType;
  /** ISO timestamp. The ONLY other field: the feed is anonymous by design. */
  at: string;
};

export type ReferredFunnel = {
  signups: number;
  trialsStarted: number;
  paid: number;
  activeSubscriptions: number;
  cancelled: number;
};

export const REFERRED_EVENTS_CAP = 20;

/**
 * A user can hold more than one subscription row (e.g. the Daily Deals add-on
 * next to the main sub). Keep one row per user, preferring the one with the
 * richest lifecycle so trial/paid history isn't shadowed by an add-on row.
 */
function dedupeByUser(rows: ReferredSubscriptionRow[]): ReferredSubscriptionRow[] {
  const richness = (row: ReferredSubscriptionRow): number => {
    let score = 0;
    if (row.trial_started_at) score += 2;
    if (row.pro_started_at) score += 2;
    if (row.trial_converted_at) score += 1;
    return score;
  };

  const byUser = new Map<string, ReferredSubscriptionRow>();
  const anonymous: ReferredSubscriptionRow[] = [];
  for (const row of rows) {
    if (!row.user_id) {
      anonymous.push(row);
      continue;
    }
    const prev = byUser.get(row.user_id);
    if (!prev || richness(row) > richness(prev)) byUser.set(row.user_id, row);
  }
  return [...byUser.values(), ...anonymous];
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function deriveReferredSignups(
  profiles: ReferredProfileRow[],
  subscriptions: ReferredSubscriptionRow[],
): { funnel: ReferredFunnel; events: ReferredEvent[] } {
  const subs = dedupeByUser(subscriptions);

  // LS "expired" = a cancelled/lapsed sub past its end date; to an affiliate
  // both read as "no longer subscribed".
  const isEnded = (s: ReferredSubscriptionRow): boolean =>
    s.status === "cancelled" || s.status === "expired";

  // "Ever paid": a converted trial, a stamped direct-Pro start, or a sub that
  // never had a trial but reached a paying status. The status inference
  // matters because prod lagged 20260618 (pro_started_at) for a while, so
  // direct-Pro rows can lack the stamp.
  const everPaid = (s: ReferredSubscriptionRow): boolean =>
    Boolean(s.trial_converted_at || s.pro_started_at) ||
    (!s.trial_started_at &&
      (s.status === "active" ||
        s.status === "past_due" ||
        s.status === "paused" ||
        isEnded(s)));

  const funnel: ReferredFunnel = {
    signups: profiles.length,
    trialsStarted: subs.filter((s) => s.trial_started_at).length,
    paid: subs.filter(everPaid).length,
    activeSubscriptions: subs.filter(
      (s) => s.status === "active" || s.status === "past_due",
    ).length,
    cancelled: subs.filter(isEnded).length,
  };

  const events: ReferredEvent[] = [];
  for (const p of profiles) {
    const at = validIso(p.ref_captured_at) ?? validIso(p.created_at);
    if (at) events.push({ type: "signup", at });
  }
  for (const s of subs) {
    const trialStarted = validIso(s.trial_started_at);
    if (trialStarted) events.push({ type: "trial_started", at: trialStarted });

    const trialConverted = validIso(s.trial_converted_at);
    if (trialConverted) events.push({ type: "trial_converted", at: trialConverted });

    const proStarted = validIso(s.pro_started_at);
    if (proStarted) events.push({ type: "subscription_started", at: proStarted });

    const endsAt = validIso(s.ends_at);
    if (isEnded(s) && endsAt) {
      events.push({ type: "cancelled", at: endsAt });
    }
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { funnel, events: events.slice(0, REFERRED_EVENTS_CAP) };
}
