// Funnel goal metrics (Funnels v2): activation % and paid % per built-in funnel.
//
// Replaces the FUNNEL_STATS maps that system-sequences/route.ts and
// funnels/route.ts each kept. Two kinds of numbers live here:
//
// 1. All-history counts (`countFunnelTotals`): how many ever entered and, where
//    a column exists, converted. Same numbers the admin cards showed before.
//
// 2. Goal metrics (`computeFunnelMetrics`), over a matured cohort: people who
//    entered in the last 180 days and long enough ago for the outcome to have
//    happened.
//    - Activation: email_subscribers.activated_at (first STRONG signal, set by
//      funnel-activation markActivated) at or before entry + 14 days. Entries
//      before the signal existed (funnelsV2StartMs(), i.e. old desktop cohorts
//      that could never produce one) are left out; when the whole matured
//      cohort predates it the block is `measurable: false`.
//    - Paid: real purchases only.
//        trial       subscriptions.trial_converted_at
//        apptrial    a paid, positive-total, non-comp order at or after entry
//                    (app_trial_converted_at is also stamped when someone merely
//                    starts a Lemon Squeezy trial, so it is not a purchase)
//        onboarding  same order rule (onboarding_converted_at is stamped when a
//                    lead starts the free app trial)
//        winback     winback_converted_at with a non-comp kind (20261110); a
//                    free comp claim is not a purchase
//        conversion  affiliate_applications.conversion_purchased_at (20261110)
//        pro         no purchase to measure (they already paid): retention instead,
//                    still active / past_due 30+ days after entry
//        upgrade     email_subscribers.plan_level became 'power' (20261109)
//
// Every lookup degrades: a missing table or column (42703 / 42P01 / PGRST204 /
// PGRST205) yields `rate: null` for that block (UI shows "needs migration")
// instead of a misleading 0%, and never throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVATION_WINDOW_DAYS, funnelsV2StartMs, type FunnelKey } from "@/lib/funnel-types";

export const DAY_MS = 86_400_000;
/** How far back a cohort reaches. */
export const COHORT_LOOKBACK_DAYS = 180;
const PAGE = 1000;
const MAX_ROWS = 20_000;
const IN_CHUNK = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricResult = {
  num: number;
  den: number;
  /** null when den = 0 or the lookup failed (missing migration). */
  rate: number | null;
  /** false = the matured cohort predates the signal ("not measurable"). */
  measurable: boolean;
};

export type PaidKind = "purchase" | "retention" | "upgrade";

export type FunnelMetrics = {
  activation: MetricResult;
  paid: MetricResult & { kind: PaidKind; label: string };
};

/** One person in a funnel cohort. `paid` null = paid lookup unavailable. */
export type CohortRow = { email: string | null; enteredAt: string | null; paid: boolean | null };

export type CohortLoad = { rows: CohortRow[]; paidAvailable: boolean };

export type FunnelCountSource = {
  table: string;
  enteredCol: string;
  convertedCol: string | null;
  convertedLabel: string | null;
  /** Extra equality filters (the upgrade funnel shares email_funnel_step_sends). */
  eq?: Record<string, string>;
};

export type FunnelMetricDef = {
  key: FunnelKey;
  paidKind: PaidKind;
  paidLabel: string;
  /** Days after entry before the paid outcome counts as settled. */
  paidMaturityDays: number;
  counts: FunnelCountSource;
};

type Db = SupabaseClient;
type Row = Record<string, unknown>;
type QueryError = { code?: string; message?: string } | null;

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const FUNNEL_METRICS: Record<FunnelKey, FunnelMetricDef> = {
  trial: {
    key: "trial",
    paidKind: "purchase",
    paidLabel: "Paid",
    paidMaturityDays: 21,
    counts: {
      table: "subscriptions",
      enteredCol: "trial_email_day0_sent_at",
      convertedCol: "trial_converted_at",
      convertedLabel: "converted to paid",
    },
  },
  pro: {
    key: "pro",
    paidKind: "retention",
    paidLabel: "Still subscribed after 30 days",
    paidMaturityDays: 30,
    counts: { table: "subscriptions", enteredCol: "pro_email_day0_sent_at", convertedCol: null, convertedLabel: null },
  },
  onboarding: {
    key: "onboarding",
    paidKind: "purchase",
    paidLabel: "Paid",
    paidMaturityDays: 17,
    counts: {
      table: "email_subscribers",
      enteredCol: "onboarding_email_day0_sent_at",
      convertedCol: "onboarding_converted_at",
      convertedLabel: "converted",
    },
  },
  apptrial: {
    key: "apptrial",
    paidKind: "purchase",
    paidLabel: "Paid",
    paidMaturityDays: 37,
    counts: {
      table: "email_subscribers",
      enteredCol: "app_trial_email_day0_sent_at",
      convertedCol: "app_trial_converted_at",
      convertedLabel: "converted",
    },
  },
  winback: {
    key: "winback",
    paidKind: "purchase",
    paidLabel: "Came back (paid)",
    paidMaturityDays: 52,
    counts: {
      table: "subscription_cancel_reasons",
      enteredCol: "winback_t1_sent_at",
      convertedCol: "winback_comp_claimed_at",
      convertedLabel: "comp claimed",
    },
  },
  conversion: {
    key: "conversion",
    paidKind: "purchase",
    paidLabel: "Paid",
    paidMaturityDays: 12,
    counts: {
      table: "affiliate_applications",
      enteredCol: "conversion_email_1h_sent_at",
      convertedCol: "conversion_purchased_at",
      convertedLabel: "purchased",
    },
  },
  upgrade: {
    key: "upgrade",
    paidKind: "upgrade",
    paidLabel: "Moved to Power User",
    paidMaturityDays: 28,
    counts: {
      table: "email_funnel_step_sends",
      enteredCol: "sent_at",
      convertedCol: null,
      convertedLabel: null,
      eq: { funnel: "upgrade", tier: "u1" },
    },
  },
};

export function isMetricFunnel(key: string): key is FunnelKey {
  return Object.prototype.hasOwnProperty.call(FUNNEL_METRICS, key);
}

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** [from, to] entry window (epoch ms) for a cohort that needs `maturityDays`. */
export function cohortBounds(
  now: number,
  maturityDays: number,
  lookbackDays: number = COHORT_LOOKBACK_DAYS,
): { from: number; to: number } {
  return { from: now - lookbackDays * DAY_MS, to: now - maturityDays * DAY_MS };
}

export function normalizeEmail(e: unknown): string | null {
  if (typeof e !== "string") return null;
  const v = e.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

/**
 * Activation % over the matured cohort. A row counts in the denominator when it
 * entered in [max(lookback, signalSince), now - windowDays]; it counts as
 * activated when activated_at <= entry + windowDays (an activation that
 * happened before entry counts too: they were already active). Rows that
 * entered before `signalSinceMs` are excluded; if only such rows exist the
 * result is measurable: false. `activatedAt` null = lookup failed (rate null).
 */
export function activationMetric(
  rows: ReadonlyArray<CohortRow>,
  activatedAt: ReadonlyMap<string, string | null> | null,
  now: number,
  signalSinceMs: number,
  windowDays: number = ACTIVATION_WINDOW_DAYS,
): MetricResult {
  const { from, to } = cohortBounds(now, windowDays);
  let den = 0;
  let num = 0;
  let preSignal = 0;
  for (const r of rows) {
    const t = ms(r.enteredAt);
    if (t === null || t < from || t > to) continue;
    if (t < signalSinceMs) {
      preSignal++;
      continue;
    }
    den++;
    if (!activatedAt) continue;
    const email = normalizeEmail(r.email);
    const at = email ? ms(activatedAt.get(email) ?? null) : null;
    if (at !== null && at <= t + windowDays * DAY_MS) num++;
  }
  const measurable = den > 0 || preSignal === 0;
  if (!activatedAt) return { num: 0, den, rate: null, measurable };
  return { num, den, rate: rate(num, den), measurable };
}

/** Paid % over rows that entered in [lookback, now - maturityDays]. */
export function paidMetric(
  rows: ReadonlyArray<CohortRow>,
  now: number,
  maturityDays: number,
  paidAvailable = true,
): MetricResult {
  const { from, to } = cohortBounds(now, maturityDays);
  let den = 0;
  let num = 0;
  for (const r of rows) {
    const t = ms(r.enteredAt);
    if (t === null || t < from || t > to) continue;
    den++;
    if (r.paid === true) num++;
  }
  if (!paidAvailable) return { num: 0, den, rate: null, measurable: true };
  return { num, den, rate: rate(num, den), measurable: true };
}

export const UNAVAILABLE: MetricResult = { num: 0, den: 0, rate: null, measurable: true };

/** Both metrics from an already-loaded cohort (pure; used by computeFunnelMetrics). */
export function metricsFromCohort(
  def: FunnelMetricDef,
  cohort: CohortLoad | null,
  activatedAt: ReadonlyMap<string, string | null> | null,
  now: number,
  signalSinceMs: number,
): FunnelMetrics {
  const paidMeta = { kind: def.paidKind, label: def.paidLabel };
  if (!cohort) {
    return { activation: { ...UNAVAILABLE }, paid: { ...UNAVAILABLE, ...paidMeta } };
  }
  return {
    activation: activationMetric(cohort.rows, activatedAt, now, signalSinceMs),
    paid: { ...paidMetric(cohort.rows, now, def.paidMaturityDays, cohort.paidAvailable), ...paidMeta },
  };
}

// ---------------------------------------------------------------------------
// DB helpers (never throw)
// ---------------------------------------------------------------------------

/** Missing column / table, in Postgres or PostgREST wording. */
export function isMissingSchema(error: QueryError | unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205";
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Pages a range query until a short page or MAX_ROWS. null on any error. */
async function fetchPaged(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: QueryError }>,
): Promise<{ rows: Row[]; error: QueryError }> {
  const rows: Row[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) return { rows, error };
    const page = (Array.isArray(data) ? data : []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, error: null };
}

async function selectCohort(
  db: Db,
  table: string,
  cols: string,
  enteredCol: string,
  sinceIso: string,
  untilIso: string,
  eq?: Record<string, string>,
): Promise<{ rows: Row[]; error: QueryError }> {
  return fetchPaged((from, to) => {
    let q = db.from(table).select(cols).gte(enteredCol, sinceIso).lte(enteredCol, untilIso);
    for (const [k, v] of Object.entries(eq ?? {})) q = q.eq(k, v);
    return q.order(enteredCol, { ascending: true }).range(from, to) as unknown as PromiseLike<{
      data: unknown;
      error: QueryError;
    }>;
  });
}

/** Tries each column list in turn, moving on only on a missing-column error. */
async function selectCohortWithFallback(
  db: Db,
  table: string,
  colsList: string[],
  enteredCol: string,
  sinceIso: string,
  untilIso: string,
  eq?: Record<string, string>,
): Promise<{ rows: Row[]; usedIndex: number } | null> {
  for (let i = 0; i < colsList.length; i++) {
    const res = await selectCohort(db, table, colsList[i], enteredCol, sinceIso, untilIso, eq);
    if (!res.error) return { rows: res.rows, usedIndex: i };
    const code = res.error.code;
    // Missing column: try the next (smaller) column list.
    if (code === "42703" || code === "PGRST204") continue;
    // Missing table is expected before a migration; anything else is logged.
    if (!isMissingSchema(res.error)) console.error(`funnel-metrics: ${table} cohort failed`, res.error);
    return null;
  }
  return null;
}

/** user_id -> lowercased email via profiles. */
async function emailsForUsers(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds.filter((u) => typeof u === "string" && u.length > 0))];
  for (const part of chunk(ids, IN_CHUNK)) {
    try {
      const { data, error } = await db.from("profiles").select("id,email").in("id", part);
      if (error) continue;
      for (const p of (data ?? []) as Row[]) {
        const email = normalizeEmail(p.email);
        if (typeof p.id === "string" && email) out.set(p.id, email);
      }
    } catch {
      // skip chunk
    }
  }
  return out;
}

/** email -> email_subscribers[col] for the given emails. null when the column
 * or table is missing. */
async function subscriberColumnByEmail(
  db: Db,
  emails: string[],
  col: string,
): Promise<Map<string, string | null> | null> {
  const out = new Map<string, string | null>();
  const list = [...new Set(emails.map(normalizeEmail).filter((e): e is string => !!e))];
  for (const part of chunk(list, IN_CHUNK)) {
    try {
      const { data, error } = await db.from("email_subscribers").select(`email,${col}`).in("email", part);
      if (error) {
        if (isMissingSchema(error)) return null;
        console.error(`funnel-metrics: email_subscribers.${col} lookup failed`, error);
        return null;
      }
      for (const r of (data ?? []) as unknown as Row[]) {
        const email = normalizeEmail(r.email);
        if (!email) continue;
        const v = r[col];
        out.set(email, typeof v === "string" && v.length > 0 ? v : null);
      }
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * email -> epoch ms of each real purchase: paid orders with a positive total
 * that are not comps (ls_subscription_id 'comp:*'). Free LS trials and free
 * comps never appear. null when profiles or orders cannot be read.
 */
export async function loadPurchaseTimes(db: Db, emails: string[]): Promise<Map<string, number[]> | null> {
  const out = new Map<string, number[]>();
  const list = [...new Set(emails.map(normalizeEmail).filter((e): e is string => !!e))];
  if (list.length === 0) return out;
  try {
    const emailById = new Map<string, string>();
    for (const part of chunk(list, IN_CHUNK)) {
      const { data, error } = await db.from("profiles").select("id,email").in("email", part);
      if (error) return null;
      for (const p of (data ?? []) as Row[]) {
        const e = normalizeEmail(p.email);
        if (e && typeof p.id === "string") emailById.set(p.id, e);
      }
    }
    for (const part of chunk([...emailById.keys()], IN_CHUNK)) {
      const { data, error } = await db
        .from("orders")
        .select("user_id,created_at,total,ls_subscription_id")
        .in("user_id", part)
        .eq("status", "paid");
      if (error) return null;
      for (const r of (data ?? []) as Row[]) {
        const email = typeof r.user_id === "string" ? emailById.get(r.user_id) : undefined;
        const t = ms(iso(r.created_at));
        const total = typeof r.total === "number" ? r.total : Number(r.total ?? 0);
        if (!email || t === null || !Number.isFinite(total) || total <= 0) continue;
        if (String(r.ls_subscription_id ?? "").startsWith("comp:")) continue;
        const listFor = out.get(email) ?? [];
        listFor.push(t);
        out.set(email, listFor);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** email -> activated_at. null when 20261109 is not applied. */
export async function loadActivatedAt(db: Db, emails: string[]): Promise<Map<string, string | null> | null> {
  return subscriberColumnByEmail(db, emails, "activated_at");
}

function iso(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Loads the cohort for one funnel. null = cohort query unavailable. */
export async function loadCohort(
  db: Db,
  key: FunnelKey,
  sinceIso: string,
  untilIso: string,
): Promise<CohortLoad | null> {
  try {
    switch (key) {
      case "trial": {
        const r = await selectCohortWithFallback(db, "subscriptions", ["user_id,trial_email_day0_sent_at,trial_converted_at"], "trial_email_day0_sent_at", sinceIso, untilIso);
        if (!r) return null;
        const emails = await emailsForUsers(db, r.rows.map((x) => String(x.user_id ?? "")));
        return {
          rows: r.rows.map((x) => ({
            email: emails.get(String(x.user_id ?? "")) ?? null,
            enteredAt: iso(x.trial_email_day0_sent_at),
            paid: Boolean(iso(x.trial_converted_at)),
          })),
          paidAvailable: true,
        };
      }
      case "pro": {
        const r = await selectCohortWithFallback(db, "subscriptions", ["user_id,status,pro_email_day0_sent_at"], "pro_email_day0_sent_at", sinceIso, untilIso);
        if (!r) return null;
        const emails = await emailsForUsers(db, r.rows.map((x) => String(x.user_id ?? "")));
        return {
          rows: r.rows.map((x) => ({
            email: emails.get(String(x.user_id ?? "")) ?? null,
            enteredAt: iso(x.pro_email_day0_sent_at),
            paid: x.status === "active" || x.status === "past_due",
          })),
          paidAvailable: true,
        };
      }
      case "onboarding":
      case "apptrial": {
        const enteredCol = key === "onboarding" ? "onboarding_email_day0_sent_at" : "app_trial_email_day0_sent_at";
        const paidCol = key === "onboarding" ? "onboarding_converted_at" : "app_trial_converted_at";
        const r = await selectCohortWithFallback(db, "email_subscribers", [`email,${enteredCol},${paidCol}`], enteredCol, sinceIso, untilIso);
        if (!r) return null;
        // Paid = a real purchase, not the *_converted_at stamp (which also
        // fires on a free LS trial start / a free app-trial start).
        const emails = r.rows.map((x) => normalizeEmail(x.email)).filter((e): e is string => !!e);
        const purchases = await loadPurchaseTimes(db, emails);
        return {
          rows: r.rows.map((x) => {
            const email = normalizeEmail(x.email);
            const entered = iso(x[enteredCol]);
            const enteredMs = ms(entered);
            const times = purchases && email ? (purchases.get(email) ?? []) : [];
            return {
              email,
              enteredAt: entered,
              paid: purchases ? enteredMs !== null && times.some((t) => t >= enteredMs) : null,
            };
          }),
          paidAvailable: purchases !== null,
        };
      }
      case "winback": {
        const r = await selectCohortWithFallback(
          db,
          "subscription_cancel_reasons",
          ["user_id,winback_t1_sent_at,winback_converted_at,winback_conversion_kind", "user_id,winback_t1_sent_at"],
          "winback_t1_sent_at",
          sinceIso,
          untilIso,
        );
        if (!r) return null;
        const emails = await emailsForUsers(db, r.rows.map((x) => String(x.user_id ?? "")));
        return {
          rows: r.rows.map((x) => ({
            email: emails.get(String(x.user_id ?? "")) ?? null,
            enteredAt: iso(x.winback_t1_sent_at),
            paid: r.usedIndex === 0 ? Boolean(iso(x.winback_converted_at)) && x.winback_conversion_kind !== "comp" : null,
          })),
          // Before 20261110 there is no purchase stamp: "needs migration".
          paidAvailable: r.usedIndex === 0,
        };
      }
      case "conversion": {
        const r = await selectCohortWithFallback(
          db,
          "affiliate_applications",
          ["email,conversion_email_1h_sent_at,conversion_purchased_at", "email,conversion_email_1h_sent_at"],
          "conversion_email_1h_sent_at",
          sinceIso,
          untilIso,
        );
        if (!r) return null;
        return {
          rows: r.rows.map((x) => ({
            email: normalizeEmail(x.email),
            enteredAt: iso(x.conversion_email_1h_sent_at),
            paid: r.usedIndex === 0 ? Boolean(iso(x.conversion_purchased_at)) : null,
          })),
          paidAvailable: r.usedIndex === 0,
        };
      }
      case "upgrade": {
        const r = await selectCohortWithFallback(db, "email_funnel_step_sends", ["email,sent_at"], "sent_at", sinceIso, untilIso, { funnel: "upgrade", tier: "u1" });
        if (!r) return null;
        const emails = r.rows.map((x) => normalizeEmail(x.email)).filter((e): e is string => !!e);
        const levels = await subscriberColumnByEmail(db, emails, "plan_level");
        return {
          rows: r.rows.map((x) => {
            const email = normalizeEmail(x.email);
            return { email, enteredAt: iso(x.sent_at), paid: levels && email ? levels.get(email) === "power" : null };
          }),
          paidAvailable: levels !== null,
        };
      }
    }
  } catch (err) {
    console.error(`funnel-metrics: ${key} cohort threw`, err);
  }
  return null;
}

/** Activation % and paid % for one funnel. Never throws. */
export async function computeFunnelMetrics(
  db: Db,
  key: FunnelKey,
  now: number = Date.now(),
  signalSinceMs: number = funnelsV2StartMs(),
): Promise<FunnelMetrics> {
  const def = FUNNEL_METRICS[key];
  const minMaturity = Math.min(ACTIVATION_WINDOW_DAYS, def.paidMaturityDays);
  const { from, to } = cohortBounds(now, minMaturity);
  const cohort = await loadCohort(db, key, new Date(from).toISOString(), new Date(to).toISOString());
  let activatedAt: Map<string, string | null> | null = null;
  if (cohort) {
    const emails = cohort.rows
      .filter((r) => {
        const t = ms(r.enteredAt);
        return t !== null && t >= signalSinceMs;
      })
      .map((r) => r.email)
      .filter((e): e is string => !!e);
    activatedAt = emails.length > 0 ? await loadActivatedAt(db, emails) : new Map();
  }
  return metricsFromCohort(def, cohort, activatedAt, now, signalSinceMs);
}

/** All-history entered / converted counts. null where a query failed. */
export async function countFunnelTotals(
  db: Db,
  key: FunnelKey,
): Promise<{ entered: number | null; converted: number | null; convertedLabel: string | null }> {
  const src = FUNNEL_METRICS[key].counts;
  const count = async (col: string): Promise<number | null> => {
    try {
      let q = db.from(src.table).select("*", { count: "exact", head: true }).not(col, "is", null);
      for (const [k, v] of Object.entries(src.eq ?? {})) q = q.eq(k, v);
      const { count: n, error } = await q;
      if (error) {
        if (!isMissingSchema(error)) console.error(`funnel-metrics: count ${src.table}.${col} failed`, error);
        return null;
      }
      return n ?? 0;
    } catch {
      return null;
    }
  };
  const [entered, converted] = await Promise.all([
    count(src.enteredCol),
    src.convertedCol ? count(src.convertedCol) : Promise.resolve(null),
  ]);
  return { entered, converted, convertedLabel: src.convertedCol ? src.convertedLabel : null };
}

// ---------------------------------------------------------------------------
// Per-email outcomes (for A/B arm conversion counts)
// ---------------------------------------------------------------------------

/**
 * email -> time of the outcome, for the people given. "activation" reads
 * activated_at; "paid" reads the funnel's purchase timestamp. Returns null
 * when the outcome has no timestamp to window against (pro retention, upgrade
 * plan level) or the lookup failed.
 */
export async function loadOutcomeTimes(
  db: Db,
  key: FunnelKey,
  metric: "activation" | "paid",
  emails: string[],
): Promise<Map<string, string | null> | null> {
  const list = [...new Set(emails.map(normalizeEmail).filter((e): e is string => !!e))];
  if (metric === "activation") return loadActivatedAt(db, list);
  try {
    switch (key) {
      case "onboarding":
      case "apptrial": {
        // Earliest real purchase (see loadPurchaseTimes), not *_converted_at.
        const times = await loadPurchaseTimes(db, list);
        if (!times) return null;
        const out = new Map<string, string | null>();
        for (const e of list) {
          const t = times.get(e);
          out.set(e, t && t.length > 0 ? new Date(Math.min(...t)).toISOString() : null);
        }
        return out;
      }
      case "conversion": {
        const out = new Map<string, string | null>();
        for (const part of chunk(list, IN_CHUNK)) {
          const { data, error } = await db
            .from("affiliate_applications")
            .select("email,conversion_purchased_at")
            .in("email", part);
          if (error) return null;
          for (const r of (data ?? []) as Row[]) {
            const e = normalizeEmail(r.email);
            if (e) out.set(e, iso(r.conversion_purchased_at));
          }
        }
        return out;
      }
      case "trial":
      case "winback": {
        // email -> user id via profiles, then the per-user timestamp.
        const idByEmail = new Map<string, string>();
        for (const part of chunk(list, IN_CHUNK)) {
          const { data, error } = await db.from("profiles").select("id,email").in("email", part);
          if (error) return null;
          for (const p of (data ?? []) as Row[]) {
            const e = normalizeEmail(p.email);
            if (e && typeof p.id === "string") idByEmail.set(e, p.id);
          }
        }
        const ids = [...idByEmail.values()];
        const atByUser = new Map<string, string | null>();
        for (const part of chunk(ids, IN_CHUNK)) {
          if (key === "trial") {
            const { data, error } = await db.from("subscriptions").select("user_id,trial_converted_at").in("user_id", part);
            if (error) return null;
            for (const r of (data ?? []) as Row[]) {
              const at = iso(r.trial_converted_at);
              if (typeof r.user_id === "string" && at) atByUser.set(r.user_id, at);
            }
          } else {
            // Real win-backs only (20261110): a free comp claim is not paid.
            const res = await db
              .from("subscription_cancel_reasons")
              .select("user_id,winback_converted_at,winback_conversion_kind")
              .in("user_id", part);
            if (res.error) return null;
            for (const r of (res.data ?? []) as Row[]) {
              const at = r.winback_conversion_kind === "comp" ? null : iso(r.winback_converted_at);
              if (typeof r.user_id === "string" && at) {
                const prev = atByUser.get(r.user_id);
                if (!prev || at < prev) atByUser.set(r.user_id, at);
              }
            }
          }
        }
        const out = new Map<string, string | null>();
        for (const [e, id] of idByEmail) out.set(e, atByUser.get(id) ?? null);
        return out;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** True when an outcome at `outcomeAt` falls in [sentAt, sentAt + windowDays]. */
export function outcomeWithinWindow(
  sentAt: string | null | undefined,
  outcomeAt: string | null | undefined,
  windowDays: number,
): boolean {
  const s = ms(sentAt);
  const o = ms(outcomeAt);
  if (s === null || o === null) return false;
  return o >= s && o <= s + windowDays * DAY_MS;
}
