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
  /** Billing cadence, precomputed by the data layer from ls_variant_id. Kept off
   *  this pure module's IO so it stays unit-testable. Null = unknown. */
  billing_interval?: "month" | "year" | null;
};

/** Aggregate, still-anonymous insights layered on top of the raw funnel. */
export type ReferredInsights = {
  /** Average trial length in days among trials that converted. */
  avgDaysToConvert: number | null;
  /** Average subscription lifetime in days among ended subs. */
  avgDaysSubscribed: number | null;
  /** Split of paying referrals by billing cadence. */
  planMix: { monthly: number; annual: number; other: number };
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

function daysBetween(startIso: string | null, endIso: string | null): number | null {
  const start = validIso(startIso);
  const end = validIso(endIso);
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (24 * 60 * 60 * 1000);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function deriveReferredSignups(
  profiles: ReferredProfileRow[],
  subscriptions: ReferredSubscriptionRow[],
): { funnel: ReferredFunnel; events: ReferredEvent[]; insights: ReferredInsights } {
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

  // Insights: trial length among converters, tenure among ended subs, and the
  // paying plan mix. All aggregate, so they never reveal an individual customer.
  const convertDays: number[] = [];
  const tenureDays: number[] = [];
  const planMix = { monthly: 0, annual: 0, other: 0 };
  for (const s of subs) {
    const conv = daysBetween(s.trial_started_at, s.trial_converted_at);
    if (conv !== null) convertDays.push(conv);

    if (isEnded(s)) {
      const anchor = s.pro_started_at ?? s.trial_converted_at ?? s.trial_started_at;
      const tenure = daysBetween(anchor, s.ends_at);
      if (tenure !== null) tenureDays.push(tenure);
    }

    if (everPaid(s)) {
      if (s.billing_interval === "year") planMix.annual += 1;
      else if (s.billing_interval === "month") planMix.monthly += 1;
      else planMix.other += 1;
    }
  }

  const insights: ReferredInsights = {
    avgDaysToConvert: average(convertDays),
    avgDaysSubscribed: average(tenureDays),
    planMix,
  };

  return { funnel, events: events.slice(0, REFERRED_EVENTS_CAP), insights };
}
