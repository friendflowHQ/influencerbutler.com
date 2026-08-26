/**
 * Pure derivation for the affiliate "Referred signups" funnel. Turns raw
 * profiles + subscriptions rows (already filtered to one referring affiliate)
 * into aggregate counts and an ANONYMOUS event feed: event type + timestamp
 * only, never ids, names, or emails. Kept free of IO so it can be unit-tested
 * directly; the /api/affiliates/referred-signups route does the reads.
 */

/** Where the referral credit was first captured. First-touch, per-account. */
export type ReferredChannel = "web" | "extension" | "desktop";

export type ReferredProfileRow = {
  created_at: string | null;
  ref_captured_at: string | null;
  /** The referred account's own user id. Used ONLY server-side to join a
   *  channel onto that account's subscription events; never sent to the client
   *  (the feed stays anonymous). Optional so pre-migration reads still type. */
  user_id?: string | null;
  /** Lead source. Absent (pre-migration) or null falls back to "web". */
  ref_channel?: ReferredChannel | null;
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

/** Signups + paid conversions inside one calendar month. */
export type ReferredMonthStat = { signups: number; conversions: number };

/** Aggregate, still-anonymous insights layered on top of the raw funnel. */
export type ReferredInsights = {
  /** Average trial length in days among trials that converted. */
  avgDaysToConvert: number | null;
  /** Average subscription lifetime in days among ended subs. */
  avgDaysSubscribed: number | null;
  /** Split of paying referrals by billing cadence. */
  planMix: { monthly: number; annual: number; other: number };
  /** Funnel drop-off as whole percentages, null when the denominator is 0. */
  conversionRates: { signupToTrial: number | null; trialToPaid: number | null };
  /** Signups counted by lead source. */
  bySource: { web: number; extension: number; desktop: number };
  /** Momentum: this calendar month vs the previous one. */
  thisMonth: ReferredMonthStat;
  lastMonth: ReferredMonthStat;
};

export type ReferredEventType =
  | "signup"
  | "trial_started"
  | "trial_converted"
  | "subscription_started"
  | "cancelled";

export type ReferredEvent = {
  type: ReferredEventType;
  /** ISO timestamp. */
  at: string;
  /** Lead source. Aggregate-safe: a channel label reveals no individual. */
  channel: ReferredChannel;
};

export type ReferredFunnel = {
  signups: number;
  trialsStarted: number;
  paid: number;
  activeSubscriptions: number;
  cancelled: number;
};

/** Upper bound on events returned to the client. The dashboard shows a small
 *  recent window by default and reveals the rest behind a "Show all" toggle,
 *  so we return the full derived feed up to this cap (the reads are already
 *  bounded to 200 rows each). */
export const REFERRED_EVENTS_MAX = 500;

/** How many events the dashboard shows before the "Show all" toggle. */
export const REFERRED_EVENTS_RECENT_VISIBLE = 15;

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

function normalizeChannel(value: string | null | undefined): ReferredChannel {
  return value === "extension" || value === "desktop" ? value : "web";
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export function deriveReferredSignups(
  profiles: ReferredProfileRow[],
  subscriptions: ReferredSubscriptionRow[],
  now: number = Date.now(),
): { funnel: ReferredFunnel; events: ReferredEvent[]; insights: ReferredInsights } {
  const subs = dedupeByUser(subscriptions);

  // Channel is a per-account, first-touch fact carried on the profile. Map it
  // by user id so subscription-derived events (which only know user_id) can
  // wear the same label as the signup. The id never leaves this function.
  const channelByUser = new Map<string, ReferredChannel>();
  for (const p of profiles) {
    if (p.user_id) channelByUser.set(p.user_id, normalizeChannel(p.ref_channel));
  }
  // Accounts referred by a direct paid checkout have no profile stamp; a direct
  // checkout is always on the website, so those default to "web".
  const channelForUser = (userId: string | null): ReferredChannel =>
    (userId && channelByUser.get(userId)) || "web";

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
    if (at) events.push({ type: "signup", at, channel: normalizeChannel(p.ref_channel) });
  }
  for (const s of subs) {
    const channel = channelForUser(s.user_id);

    const trialStarted = validIso(s.trial_started_at);
    if (trialStarted) events.push({ type: "trial_started", at: trialStarted, channel });

    const trialConverted = validIso(s.trial_converted_at);
    if (trialConverted) events.push({ type: "trial_converted", at: trialConverted, channel });

    const proStarted = validIso(s.pro_started_at);
    if (proStarted) events.push({ type: "subscription_started", at: proStarted, channel });

    const endsAt = validIso(s.ends_at);
    if (isEnded(s) && endsAt) {
      events.push({ type: "cancelled", at: endsAt, channel });
    }
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  // Signups by source (free-signup profiles carry the channel directly).
  const bySource = { web: 0, extension: 0, desktop: 0 };
  for (const p of profiles) bySource[normalizeChannel(p.ref_channel)] += 1;

  // Momentum: signups and paid conversions in this calendar month vs the last.
  // A "conversion" is the moment an account started paying (a converted trial
  // or a direct-Pro start), matching the "Converted to paid" funnel stat.
  const nowDate = new Date(now);
  const thisMonthStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);
  const lastMonthStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1);
  const thisMonth: ReferredMonthStat = { signups: 0, conversions: 0 };
  const lastMonth: ReferredMonthStat = { signups: 0, conversions: 0 };
  const bucketFor = (iso: string): ReferredMonthStat | null => {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return null;
    if (ms >= thisMonthStart) return thisMonth;
    if (ms >= lastMonthStart) return lastMonth;
    return null;
  };
  for (const event of events) {
    if (event.type === "signup") {
      const bucket = bucketFor(event.at);
      if (bucket) bucket.signups += 1;
    } else if (event.type === "trial_converted" || event.type === "subscription_started") {
      const bucket = bucketFor(event.at);
      if (bucket) bucket.conversions += 1;
    }
  }

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
    conversionRates: {
      signupToTrial: percentage(funnel.trialsStarted, funnel.signups),
      trialToPaid: percentage(funnel.paid, funnel.trialsStarted),
    },
    bySource,
    thisMonth,
    lastMonth,
  };

  return { funnel, events: events.slice(0, REFERRED_EVENTS_MAX), insights };
}
