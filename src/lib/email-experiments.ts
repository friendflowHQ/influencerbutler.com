// Funnels v2 A/B engine: built-in funnel step experiments and the sequence
// -a/-b variant groups, on the email_experiments / email_experiment_arms
// tables (20261110_funnels_v2_measure.sql).
//
// - assignArm: deterministic 50/50 by hash of email + experiment id (no
//   assignment table), via splitBucket from email-audience.ts.
// - chooseExperimentCopy / resolveFunnelCopyWithExperiment: the send path asks
//   for copy; arm 'a' (control) keeps the resolved copy, arm 'b' renders its
//   template. Returns the experiment id + variant to log on email_sends.
// - loadArmStats: sends, matured clicks, paid conversion (real paid orders)
//   and activation within the conversion window, per arm.
// - promoteWinner: writes the winning copy into email_funnel_overrides at the
//   experiment's content key; refuses ('conflict') to write a bare tier when
//   tailored track/module copy exists for that tier (a bare override never
//   beats tailored code copy, so the promotion would silently not apply).
// - evaluateExperiments: once per America/Denver day (app_config marker
//   ab_evaluate_YYYY-MM-DD), weekly looks after min sends, max 4 looks at the
//   Pocock alpha, auto-stop of price-lock tests after the price change, a
//   founder warning when 200/arm is out of reach, and auto-decide of sequence
//   variant groups (loser paused).
//
// Degrades quietly when the migration is not applied: a missing table or
// column (42P01 / PGRST205 / 42703 / PGRST204) means "no experiments" and every
// send uses the control copy.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { splitBucket } from "@/lib/email-audience";
import {
  loadFunnelOverrides,
  renderTemplate,
  resolveFunnelCopyForKey,
  isOverrideActive,
  type FunnelOverride,
  type ResolvedKeyCopy,
} from "@/lib/funnel-copy";
import {
  codeDefaultForExactKey,
  findFunnel,
  findStep,
  funnelDefaultsForKey,
  isValidContentKey,
  makeCodeDefaultForKey,
} from "@/lib/system-funnels";
import { MODULE_KEYS, MODULE_KEY_PREFIX, contentKeyTier, funnelsV2Enabled, type PlanBase } from "@/lib/funnel-types";
import { PRICE_CHANGE, priceChangeActive } from "@/lib/pricing-constants";
import { shortId } from "@/lib/email-marketing";
import {
  CLICK_MATURITY_HOURS,
  DEFAULT_CONVERSION_WINDOW_DAYS,
  DEFAULT_MAX_DAYS,
  DEFAULT_MIN_SENDS_PER_ARM,
  MAX_LOOKS,
  decideExperiment,
  lookDue,
  projectSendsPerArm,
  type AbArmKey,
  type AbMetric,
  type ArmStats,
  type DecideResult,
  type MetricCount,
} from "@/lib/ab-stats";
import { sendAbDecisionEmail, type AbEmailArm } from "@/lib/ab-decision-email";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExperimentKind = "funnel_step" | "sequence_group";
export type ExperimentStatus = "draft" | "running" | "decided" | "stopped";

export type ExperimentArm = {
  arm: AbArmKey;
  subject: string | null;
  body: string | null;
  sequenceId: string | null;
};

export type Experiment = {
  id: string;
  kind: ExperimentKind;
  name: string;
  funnel: string | null;
  tier: string | null;
  contentKey: string | null;
  segment: string | null;
  baseTag: string | null;
  primaryMetric: AbMetric;
  guardrailMetric: AbMetric | null;
  status: ExperimentStatus;
  minSendsPerArm: number;
  maxDays: number;
  conversionWindowDays: number;
  looksDone: number;
  lastLookAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  decidedAt: string | null;
  winnerArm: AbArmKey | null;
  decision: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string | null;
  updatedBy: string;
  updatedAt: string | null;
  arms: ExperimentArm[];
};

/** Shape the admin UI consumes (contracts doc section 8). */
export type ExperimentSummary = {
  id: string;
  kind: ExperimentKind;
  funnel: string | null;
  tier: string | null;
  contentKey: string | null;
  segment: string | null;
  baseTag: string | null;
  name: string;
  status: ExperimentStatus;
  primaryMetric: AbMetric;
  guardrailMetric: AbMetric | null;
  minSendsPerArm: number;
  maxDays: number;
  looksDone: number;
  maxLooks: number;
  lastLookAt: string | null;
  startedAt: string | null;
  decidedAt: string | null;
  winnerArm: AbArmKey | null;
  decision: Record<string, unknown> | null;
  arms: {
    arm: AbArmKey;
    subject: string | null;
    body: string | null;
    sequenceId: string | null;
    sends: number;
    clicks: number;
    conversions: number;
    clickRate: number | null;
    conversionRate: number | null;
  }[];
};

type DbError = { code?: string; message?: string } | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;
const IN_CHUNK = 200;
/** Max sends scanned per arm-stats load (keeps the daily run bounded). */
const SEND_SCAN_CAP = 60000;
const AB_ACTOR = "ab:auto";
const DENVER_TZ = "America/Denver";
/** Hour (Denver) from which the daily evaluation may run. */
const EVALUATE_FROM_HOUR = 9;
const PROJECTION_LOOKBACK_DAYS = 14;

const ARM_HASH_PRIME = 1_000_003;

export const PRICE_LOCK_TOKEN_RE = /\{\{\s*priceLockLine\s*\}\}/;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function isMissingRelation(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /relation .* does not exist|could not find the table/i.test(msg);
}

export function isMissingColumn(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return /column .* does not exist|could not find the .* column/i.test(msg);
}

function isMigrationGap(error: DbError): boolean {
  return isMissingRelation(error) || isMissingColumn(error);
}

// ---------------------------------------------------------------------------
// Assignment and copy
// ---------------------------------------------------------------------------

/** Deterministic arm for a person: same email + experiment = same arm, and
 * roughly even across arms. Case and surrounding whitespace are ignored. */
export function assignArm<T extends string = AbArmKey>(
  email: string,
  experimentId: string,
  arms: readonly T[] = ["a", "b"] as unknown as readonly T[],
): T {
  if (arms.length === 0) throw new Error("assignArm: no arms");
  // FNV-1a's low bit is just the XOR of the input bytes' low bits, so
  // `hash % 2` alone would put a person in perfectly correlated arms across
  // experiments. The experiment id goes first (so the email bytes are mixed
  // after it) and the hash is reduced by a large prime before % arms, which
  // folds the high bits in. Verified independent across experiment ids.
  const key = `${experimentId.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
  return arms[splitBucket(key, ARM_HASH_PRIME) % arms.length];
}

/** The running funnel-step experiment a send at `contentKey` belongs to. A
 * segmented test matches its exact content key; an unsegmented one matches
 * every key of its tier. The segmented match wins when both exist. */
export function matchExperiment(
  experiments: readonly Experiment[],
  funnel: string,
  contentKey: string,
): Experiment | null {
  const tier = contentKeyTier(contentKey);
  let broad: Experiment | null = null;
  for (const e of experiments) {
    if (e.kind !== "funnel_step" || e.status !== "running" || e.funnel !== funnel) continue;
    if (e.segment && e.contentKey === contentKey) return e;
    if (!e.segment && e.tier === tier && !broad) broad = e;
  }
  return broad;
}

/** Renders one arm over the control copy, field by field (a blank arm field
 * keeps the control's). Arm 'a' with no copy is the control itself. */
export function renderArmCopy(
  arm: ExperimentArm | undefined,
  control: { subject: string; body: string },
  vars: Record<string, unknown>,
): { subject: string; body: string } {
  if (!arm) return control;
  const subject =
    arm.subject && arm.subject.trim().length > 0 ? renderTemplate(arm.subject, vars) : control.subject;
  const body = arm.body && arm.body.trim().length > 0 ? renderTemplate(arm.body, vars) : control.body;
  return { subject, body };
}

/** Pure: resolveFunnelCopyForKey plus the experiment overlay. */
export function resolveFunnelCopyWithExperiment(args: {
  funnel: string;
  contentKey: string;
  vars: Record<string, unknown>;
  overrides: Map<string, FunnelOverride>;
  email: string;
  experiments: readonly Experiment[];
  codeDefaultForKey?: (key: string) => { subject: string; body: string } | null;
}): ResolvedKeyCopy & { experimentId?: string; variant?: AbArmKey } {
  const resolved = resolveFunnelCopyForKey({
    funnel: args.funnel,
    contentKey: args.contentKey,
    vars: args.vars,
    overrides: args.overrides,
    codeDefaultForKey: args.codeDefaultForKey ?? makeCodeDefaultForKey(args.funnel, args.vars),
  });
  const exp = matchExperiment(args.experiments, args.funnel, args.contentKey);
  if (!exp || !args.email) return resolved;
  const variant = assignArm(args.email, exp.id);
  const copy = renderArmCopy(
    exp.arms.find((a) => a.arm === variant),
    { subject: resolved.subject, body: resolved.body },
    args.vars,
  );
  return { ...resolved, ...copy, experimentId: exp.id, variant };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type ExperimentDbRow = {
  id: string;
  kind?: string | null;
  name?: string | null;
  funnel: string | null;
  tier: string | null;
  content_key: string | null;
  segment: string | null;
  base_tag?: string | null;
  primary_metric: string | null;
  guardrail_metric: string | null;
  status: string;
  min_sends_per_arm: number | null;
  max_days: number | null;
  conversion_window_days?: number | null;
  looks_done: number | null;
  last_look_at: string | null;
  started_at: string | null;
  ended_at?: string | null;
  decided_at: string | null;
  winner_arm: string | null;
  decision: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

type ArmDbRow = {
  experiment_id: string;
  arm: string;
  subject: string | null;
  body: string | null;
  sequence_id?: string | null;
};

function asMetric(v: unknown, fallback: AbMetric | null): AbMetric | null {
  return v === "click" || v === "paid" || v === "activation" ? v : fallback;
}

function asArm(v: unknown): AbArmKey | null {
  return v === "a" || v === "b" ? v : null;
}

export function experimentFromRow(row: ExperimentDbRow, arms: ArmDbRow[]): Experiment {
  const status = (["draft", "running", "decided", "stopped"] as const).includes(
    row.status as ExperimentStatus,
  )
    ? (row.status as ExperimentStatus)
    : "draft";
  return {
    id: row.id,
    kind: row.kind === "sequence_group" ? "sequence_group" : "funnel_step",
    name: row.name ?? "",
    funnel: row.funnel,
    tier: row.tier,
    contentKey: row.content_key ?? row.tier,
    segment: row.segment && row.segment.trim() ? row.segment : null,
    baseTag: row.base_tag ?? null,
    primaryMetric: asMetric(row.primary_metric, "click") as AbMetric,
    guardrailMetric: asMetric(row.guardrail_metric, null),
    status,
    minSendsPerArm: row.min_sends_per_arm ?? DEFAULT_MIN_SENDS_PER_ARM,
    maxDays: row.max_days ?? DEFAULT_MAX_DAYS,
    conversionWindowDays: row.conversion_window_days ?? DEFAULT_CONVERSION_WINDOW_DAYS,
    looksDone: row.looks_done ?? 0,
    lastLookAt: row.last_look_at,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    decidedAt: row.decided_at,
    winnerArm: asArm(row.winner_arm),
    decision: row.decision ?? null,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at ?? null,
    updatedBy: row.updated_by ?? "",
    updatedAt: row.updated_at ?? null,
    arms: arms
      .filter((a) => a.experiment_id === row.id && asArm(a.arm))
      .map((a) => ({
        arm: a.arm as AbArmKey,
        subject: a.subject,
        body: a.body,
        sequenceId: a.sequence_id ?? null,
      }))
      .sort((x, y) => x.arm.localeCompare(y.arm)),
  };
}

/**
 * Loads experiments with their arms. `null` = the tables are missing
 * (migration pending); `[]` = none match.
 */
export async function loadExperiments(
  db: SupabaseClient,
  opts: { statuses?: ExperimentStatus[]; funnel?: string; id?: string; kind?: ExperimentKind; limit?: number } = {},
): Promise<Experiment[] | null> {
  let q = db.from("email_experiments").select("*").order("created_at", { ascending: false });
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.statuses && opts.statuses.length > 0) q = q.in("status", opts.statuses);
  if (opts.funnel) q = q.eq("funnel", opts.funnel);
  if (opts.id) q = q.eq("id", opts.id);
  q = q.limit(opts.limit ?? 200);
  const { data, error } = await q.returns<ExperimentDbRow[]>();
  if (error) {
    if (isMigrationGap(error)) return null;
    console.error("email-experiments: load failed", error);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const arms: ArmDbRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    let res = await db
      .from("email_experiment_arms")
      .select("experiment_id, arm, subject, body, sequence_id")
      .in("experiment_id", slice)
      .returns<ArmDbRow[]>();
    if (res.error && isMissingColumn(res.error)) {
      res = await db
        .from("email_experiment_arms")
        .select("experiment_id, arm, subject, body")
        .in("experiment_id", slice)
        .returns<ArmDbRow[]>();
    }
    if (res.error) {
      if (isMissingRelation(res.error)) return null;
      console.error("email-experiments: arms load failed", res.error);
      continue;
    }
    arms.push(...(res.data ?? []));
  }
  return rows.map((r) => experimentFromRow(r, arms));
}

// 60s in-process cache of running experiments for the send path (a cron batch
// loads them once, not once per recipient). Same pattern as getFunnelOverrides.
let runningCache: Experiment[] | null = null;
let runningCacheAt = 0;
const RUNNING_TTL_MS = 60_000;

/** Clears the running-experiment cache (tests, and after start/stop). */
export function clearExperimentCache(): void {
  runningCache = null;
  runningCacheAt = 0;
}

/** Cached running experiments. Never throws; [] when the tables are missing. */
export async function getRunningExperiments(db?: SupabaseClient | null): Promise<Experiment[]> {
  const now = Date.now();
  if (runningCache && now - runningCacheAt < RUNNING_TTL_MS) return runningCache;
  try {
    const client = db ?? createAdminClient();
    const list = await loadExperiments(client, { statuses: ["running"] });
    runningCache = list ?? [];
    runningCacheAt = now;
  } catch {
    runningCache = runningCache ?? [];
  }
  return runningCache;
}

/** The running funnel-step experiment for this funnel + content key, or null. */
export async function loadRunningExperiment(
  funnel: string,
  contentKey: string,
  db?: SupabaseClient | null,
): Promise<Experiment | null> {
  return matchExperiment(await getRunningExperiments(db), funnel, contentKey);
}

/**
 * Send-path entry point for the funnel crons. `defaultCopy` is the copy the
 * cron already resolved for this person (resolveFunnelCopyForKey): it is the
 * control (arm 'a'). When a running experiment covers the content key, the
 * person's arm is chosen by assignArm and arm 'b' renders its template with
 * `vars` (pass the same vars used for the control). Log the returned
 * experimentId + variant on email_sends. Never throws; on any failure the
 * default copy comes back with no experiment.
 */
export async function chooseExperimentCopy(
  db: SupabaseClient | null,
  args: {
    funnel: string;
    contentKey: string;
    email: string;
    defaultCopy: { subject: string; body: string };
    vars?: Record<string, unknown>;
  },
): Promise<{ subject: string; body: string; experimentId?: string; variant?: AbArmKey }> {
  const control = { subject: args.defaultCopy.subject, body: args.defaultCopy.body };
  try {
    if (!args.email) return control;
    const exp = await loadRunningExperiment(args.funnel, args.contentKey, db);
    if (!exp) return control;
    const variant = assignArm(args.email, exp.id);
    const copy = renderArmCopy(
      exp.arms.find((a) => a.arm === variant),
      control,
      args.vars ?? {},
    );
    return { ...copy, experimentId: exp.id, variant };
  } catch (err) {
    console.error("email-experiments: chooseExperimentCopy failed", err);
    return control;
  }
}

// ---------------------------------------------------------------------------
// Arm copy validation (shared with the experiments admin route)
// ---------------------------------------------------------------------------

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})[a-z]*\\b`, "i"),
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{2,4}\b/,
];

/**
 * Why an arm's copy is not allowed, or null when it is fine:
 * em dash, en dash outside a numeric range, a literal date (time-bound copy
 * goes stale mid-test), "Nov 29", or {{priceLockLine}} (never A/B the price
 * lock; it disappears on its own after the price change).
 */
export function armCopyProblem(text: string | null | undefined): string | null {
  if (!text) return null;
  if (text.includes("\u2014")) return "Remove the em dash. Use a colon, hyphen or comma.";
  if (/(?<!\d)\u2013|\u2013(?!\d)/.test(text)) return "Remove the en dash (only allowed in number ranges like 2024-2026).";
  if (PRICE_LOCK_TOKEN_RE.test(text)) return "Arms cannot use {{priceLockLine}}: the price lock is never A/B tested.";
  if (/nov(?:ember)?\.?\s*29/i.test(text)) return 'Arms cannot mention "Nov 29": dated copy goes stale mid-test.';
  for (const re of DATE_PATTERNS) {
    if (re.test(text)) return "Arms cannot contain a literal date: dated copy goes stale mid-test.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Arm stats
// ---------------------------------------------------------------------------

export type SendRow = {
  recipient: string;
  variant: string | null;
  createdAt: string;
  clickedAt: string | null;
};

const emptyMetrics = (): Record<AbMetric, MetricCount | null> => ({
  click: { n: 0, x: 0 },
  paid: { n: 0, x: 0 },
  activation: { n: 0, x: 0 },
});

/**
 * Pure arm stats for a funnel-step experiment. One row per recipient + arm
 * (first send). Click counts once the send is CLICK_MATURITY_HOURS old; paid
 * and activation count once the send is `windowDays` old and the event falls
 * inside [send, send + windowDays]. A null map means that metric could not be
 * read (its metric becomes null).
 */
export function computeFunnelArmStats(
  sends: readonly SendRow[],
  opts: {
    now: number;
    windowDays: number;
    paidAt: Map<string, number[]> | null;
    activatedAt: Map<string, number> | null;
  },
): ArmStats[] {
  const out: Record<AbArmKey, ArmStats> = {
    a: { arm: "a", sent: 0, metrics: emptyMetrics() },
    b: { arm: "b", sent: 0, metrics: emptyMetrics() },
  };
  if (!opts.paidAt) {
    out.a.metrics.paid = null;
    out.b.metrics.paid = null;
  }
  if (!opts.activatedAt) {
    out.a.metrics.activation = null;
    out.b.metrics.activation = null;
  }
  const clickMatureBefore = opts.now - CLICK_MATURITY_HOURS * 60 * 60 * 1000;
  const windowMs = opts.windowDays * DAY_MS;
  const convMatureBefore = opts.now - windowMs;
  const seen = new Set<string>();
  for (const s of sends) {
    const arm = asArm(s.variant);
    if (!arm) continue;
    const email = s.recipient.trim().toLowerCase();
    const key = `${arm}:${email}`;
    if (!email || seen.has(key)) continue;
    seen.add(key);
    const sentMs = Date.parse(s.createdAt);
    if (!Number.isFinite(sentMs)) continue;
    const st = out[arm];
    st.sent += 1;
    if (sentMs <= clickMatureBefore) {
      const c = st.metrics.click!;
      c.n += 1;
      if (s.clickedAt) c.x += 1;
    }
    if (sentMs <= convMatureBefore) {
      const p = st.metrics.paid;
      if (p && opts.paidAt) {
        p.n += 1;
        const times = opts.paidAt.get(email) ?? [];
        if (times.some((t) => t >= sentMs && t <= sentMs + windowMs)) p.x += 1;
      }
      const a = st.metrics.activation;
      if (a && opts.activatedAt) {
        a.n += 1;
        const t = opts.activatedAt.get(email);
        if (t !== undefined && t >= sentMs && t <= sentMs + windowMs) a.x += 1;
      }
    }
  }
  return [out.a, out.b];
}

async function loadExperimentSends(db: SupabaseClient, exp: Experiment): Promise<SendRow[] | null> {
  const rows: SendRow[] = [];
  for (let offset = 0; offset < SEND_SCAN_CAP; offset += PAGE) {
    let q = db
      .from("email_sends")
      .select("recipient, variant, created_at, clicked_at")
      .eq("experiment_id", exp.id)
      .eq("status", "sent");
    if (exp.startedAt) q = q.gte("created_at", exp.startedAt);
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1)
      .returns<{ recipient: string; variant: string | null; created_at: string; clicked_at: string | null }[]>();
    if (error) {
      if (isMigrationGap(error)) return null;
      console.error("email-experiments: sends scan failed", error);
      return null;
    }
    for (const r of data ?? []) {
      rows.push({ recipient: r.recipient, variant: r.variant, createdAt: r.created_at, clickedAt: r.clicked_at });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

/** email -> profile user id, chunked. null on error. */
async function userIdsForEmails(db: SupabaseClient, emails: string[]): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  for (let i = 0; i < emails.length; i += IN_CHUNK) {
    const slice = emails.slice(i, i + IN_CHUNK);
    const { data, error } = await db
      .from("profiles")
      .select("id, email")
      .in("email", slice)
      .returns<{ id: string; email: string | null }[]>();
    if (error) return null;
    for (const r of data ?? []) {
      const e = (r.email ?? "").trim().toLowerCase();
      if (e && r.id) out.set(e, r.id);
    }
  }
  return out;
}

/**
 * The first paid, positive-total, non-comp order of each (user, subscription)
 * pair, in input order. Orders without a subscription id (one-off purchases)
 * each count. Input should be sorted by created_at ascending. Pure.
 */
export function firstPaidOrders<
  T extends { user_id: string; created_at: string; total: number | string | null; ls_subscription_id: string | null },
>(rows: readonly T[]): T[] {
  const sorted = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of sorted) {
    const total = typeof r.total === "number" ? r.total : Number(r.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) continue;
    const sub = r.ls_subscription_id ?? "";
    if (sub.startsWith("comp:")) continue;
    if (sub) {
      const key = `${r.user_id}|${sub}`;
      if (seen.has(key)) continue; // a renewal
      seen.add(key);
    }
    out.push(r);
  }
  return out;
}

/**
 * Real paid purchases per email since `sinceIso`: the first paid order with a
 * positive total on each real (non-comp) Lemon Squeezy subscription (renewals
 * excluded, see firstPaidOrders). Falls back to live
 * paid subscriptions (active / past_due, non-comp) by created_at if the
 * orders read fails. null when neither can be read.
 */
export async function loadPaidTimes(
  db: SupabaseClient,
  emails: string[],
  sinceIso: string | null,
): Promise<Map<string, number[]> | null> {
  const out = new Map<string, number[]>();
  if (emails.length === 0) return out;
  const idByEmail = await userIdsForEmails(db, emails);
  if (!idByEmail) return null;
  const emailById = new Map<string, string>();
  for (const [e, id] of idByEmail) emailById.set(id, e);
  const ids = [...emailById.keys()];
  const push = (userId: string, iso: string | null) => {
    const email = emailById.get(userId);
    const ms = iso ? Date.parse(iso) : NaN;
    if (!email || !Number.isFinite(ms)) return;
    const list = out.get(email) ?? [];
    list.push(ms);
    out.set(email, list);
  };

  // Only a subscription's FIRST paid order counts: renewals of a subscription
  // the person already had are not conversions (about half of existing
  // subscribers renew inside any 14-day window, which would drown the signal
  // for pro / upgrade steps). So read each user's full paid history, keep the
  // first order per (user, subscription), then apply `sinceIso`.
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  let ordersOk = true;
  for (let i = 0; i < ids.length && ordersOk; i += IN_CHUNK) {
    const { data, error } = await db
      .from("orders")
      .select("user_id, created_at, total, ls_subscription_id")
      .in("user_id", ids.slice(i, i + IN_CHUNK))
      .eq("status", "paid")
      .order("created_at", { ascending: true })
      .returns<
        { user_id: string; created_at: string; total: number | string | null; ls_subscription_id: string | null }[]
      >();
    if (error) {
      ordersOk = false;
      break;
    }
    for (const r of firstPaidOrders(data ?? [])) {
      if (Number.isFinite(sinceMs) && !(Date.parse(r.created_at) >= sinceMs)) continue;
      push(r.user_id, r.created_at);
    }
  }
  if (ordersOk) return out;

  out.clear();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    let q = db
      .from("subscriptions")
      .select("user_id, created_at, status, ls_subscription_id")
      .in("user_id", ids.slice(i, i + IN_CHUNK))
      .in("status", ["active", "past_due"]);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q.returns<
      { user_id: string; created_at: string; status: string; ls_subscription_id: string | null }[]
    >();
    if (error) return null;
    for (const r of data ?? []) {
      if ((r.ls_subscription_id ?? "").startsWith("comp:")) continue;
      push(r.user_id, r.created_at);
    }
  }
  return out;
}

/** email_subscribers.activated_at per email (20261109). null when unreadable. */
export async function loadActivatedTimes(
  db: SupabaseClient,
  emails: string[],
): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  for (let i = 0; i < emails.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from("email_subscribers")
      .select("email, activated_at")
      .in("email", emails.slice(i, i + IN_CHUNK))
      .not("activated_at", "is", null)
      .returns<{ email: string; activated_at: string | null }[]>();
    if (error) return null;
    for (const r of data ?? []) {
      const ms = r.activated_at ? Date.parse(r.activated_at) : NaN;
      if (Number.isFinite(ms)) out.set(r.email.trim().toLowerCase(), ms);
    }
  }
  return out;
}

/**
 * Per-arm stats for an experiment. funnel_step: from email_sends rows tagged
 * with experiment_id / variant. sequence_group: from each arm sequence's
 * sends (category seq_<id8>_s*) and enrollments. null when the data cannot
 * be read (migration pending).
 */
export async function loadArmStats(
  db: SupabaseClient,
  exp: Experiment,
  now: number = Date.now(),
): Promise<ArmStats[] | null> {
  if (exp.kind === "sequence_group") return loadSequenceArmStats(db, exp, now);
  const sends = await loadExperimentSends(db, exp);
  if (!sends) return null;
  const emails = [...new Set(sends.map((s) => s.recipient.trim().toLowerCase()).filter(Boolean))];
  // Paid is always loaded: the admin summary shows conversions for every test.
  const needAct = exp.primaryMetric === "activation" || exp.guardrailMetric === "activation";
  const [paidAt, activatedAt] = await Promise.all([
    loadPaidTimes(db, emails, exp.startedAt).catch(() => null),
    needAct ? loadActivatedTimes(db, emails).catch(() => null) : Promise.resolve(null),
  ]);
  return computeFunnelArmStats(sends, {
    now,
    windowDays: exp.conversionWindowDays,
    paidAt,
    activatedAt,
  });
}

/** Pure arm stats for one sequence arm. */
export function computeSequenceArmStats(
  arm: AbArmKey,
  sends: readonly { recipient: string; createdAt: string; clickedAt: string | null }[],
  enrollments:
    | readonly { enrolledAt: string; lastStepSent: number | null; paid: boolean }[]
    | null,
  opts: { now: number; windowDays: number },
): ArmStats {
  const clickMatureBefore = opts.now - CLICK_MATURITY_HOURS * 60 * 60 * 1000;
  const first = new Map<string, { ms: number; clicked: boolean }>();
  let sent = 0;
  for (const s of sends) {
    const email = s.recipient.trim().toLowerCase();
    const ms = Date.parse(s.createdAt);
    if (!email || !Number.isFinite(ms)) continue;
    sent += 1;
    const cur = first.get(email);
    if (!cur) first.set(email, { ms, clicked: Boolean(s.clickedAt) });
    else {
      cur.ms = Math.min(cur.ms, ms);
      cur.clicked = cur.clicked || Boolean(s.clickedAt);
    }
  }
  const click: MetricCount = { n: 0, x: 0 };
  for (const v of first.values()) {
    if (v.ms > clickMatureBefore) continue;
    click.n += 1;
    if (v.clicked) click.x += 1;
  }
  let paid: MetricCount | null = null;
  if (enrollments) {
    paid = { n: 0, x: 0 };
    const matureBefore = opts.now - opts.windowDays * DAY_MS;
    for (const e of enrollments) {
      const ms = Date.parse(e.enrolledAt);
      if (!Number.isFinite(ms) || ms > matureBefore) continue;
      if ((e.lastStepSent ?? 0) < 1) continue;
      paid.n += 1;
      if (e.paid) paid.x += 1;
    }
  }
  return { arm, sent, metrics: { click, paid, activation: null } };
}

async function loadSequenceArmStats(
  db: SupabaseClient,
  exp: Experiment,
  now: number,
): Promise<ArmStats[] | null> {
  const out: ArmStats[] = [];
  // No start stamp = nothing to measure yet (never fall back to all history).
  if (!exp.startedAt) return null;
  const startIso = exp.startedAt;
  for (const arm of exp.arms) {
    if (!arm.sequenceId) return null;
    const sends: { recipient: string; createdAt: string; clickedAt: string | null }[] = [];
    for (let offset = 0; offset < SEND_SCAN_CAP; offset += PAGE) {
      const { data, error } = await db
        .from("email_sends")
        .select("recipient, created_at, clicked_at")
        .like("category", `seq_${shortId(arm.sequenceId)}_s%`)
        .eq("status", "sent")
        // Only sends since the test started: historic sends would let a
        // freshly auto-created group test decide on its first look.
        .gte("created_at", startIso)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1)
        .returns<{ recipient: string; created_at: string; clicked_at: string | null }[]>();
      if (error) {
        console.error("email-experiments: sequence sends scan failed", error);
        return null;
      }
      for (const r of data ?? []) {
        sends.push({ recipient: r.recipient, createdAt: r.created_at, clickedAt: r.clicked_at });
      }
      if ((data ?? []).length < PAGE) break;
    }

    // Enrollments: paid = converted_kind 'paid' (20261110), else converted_at.
    let enrollments: { enrolledAt: string; lastStepSent: number | null; paid: boolean }[] | null = [];
    let cols = "enrolled_at, last_step_sent, converted_at, converted_kind";
    for (let offset = 0; offset < SEND_SCAN_CAP; offset += PAGE) {
      let res = await db
        .from("email_sequence_enrollments")
        .select(cols)
        .eq("sequence_id", arm.sequenceId)
        .gte("enrolled_at", startIso)
        .range(offset, offset + PAGE - 1)
        .returns<
          { enrolled_at: string; last_step_sent: number | null; converted_at?: string | null; converted_kind?: string | null }[]
        >();
      if (res.error && isMissingColumn(res.error) && cols.includes("converted_kind")) {
        cols = "enrolled_at, last_step_sent, converted_at";
        res = await db
          .from("email_sequence_enrollments")
          .select(cols)
          .eq("sequence_id", arm.sequenceId)
          .gte("enrolled_at", startIso)
          .range(offset, offset + PAGE - 1)
          .returns<{ enrolled_at: string; last_step_sent: number | null; converted_at?: string | null; converted_kind?: string | null }[]>();
      }
      if (res.error) {
        enrollments = null;
        break;
      }
      const hasKind = cols.includes("converted_kind");
      for (const r of res.data ?? []) {
        enrollments!.push({
          enrolledAt: r.enrolled_at,
          lastStepSent: r.last_step_sent,
          // converted_kind is stamped by the sequence cron since 20261110; a
          // row converted before that has a null kind and keeps converted_at.
          paid: hasKind
            ? r.converted_kind === "paid" || (r.converted_kind == null && Boolean(r.converted_at))
            : Boolean(r.converted_at),
        });
      }
      if ((res.data ?? []).length < PAGE) break;
    }
    out.push(
      computeSequenceArmStats(arm.arm, sends, enrollments, {
        now,
        windowDays: exp.conversionWindowDays,
      }),
    );
  }
  return out;
}

/** UI summary from an experiment and (optional) stats. */
export function buildExperimentSummary(exp: Experiment, stats: ArmStats[] | null): ExperimentSummary {
  const convMetric: AbMetric =
    exp.primaryMetric !== "click" ? exp.primaryMetric : exp.guardrailMetric && exp.guardrailMetric !== "click" ? exp.guardrailMetric : "paid";
  return {
    id: exp.id,
    kind: exp.kind,
    funnel: exp.funnel,
    tier: exp.tier,
    contentKey: exp.contentKey,
    segment: exp.segment,
    baseTag: exp.baseTag,
    name: exp.name,
    status: exp.status,
    primaryMetric: exp.primaryMetric,
    guardrailMetric: exp.guardrailMetric,
    minSendsPerArm: exp.minSendsPerArm,
    maxDays: exp.maxDays,
    looksDone: exp.looksDone,
    maxLooks: MAX_LOOKS,
    lastLookAt: exp.lastLookAt,
    startedAt: exp.startedAt,
    decidedAt: exp.decidedAt,
    winnerArm: exp.winnerArm,
    decision: exp.decision,
    arms: exp.arms.map((a) => {
      const st = stats?.find((s) => s.arm === a.arm) ?? null;
      const c = st?.metrics.click ?? null;
      const v = st?.metrics[convMetric] ?? null;
      return {
        arm: a.arm,
        subject: a.subject,
        body: a.body,
        sequenceId: a.sequenceId,
        sends: st?.sent ?? 0,
        clicks: c?.x ?? 0,
        conversions: v?.x ?? 0,
        clickRate: c && c.n > 0 ? c.x / c.n : null,
        conversionRate: v && v.n > 0 ? v.x / v.n : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

const ALL_BASES: PlanBase[] = ["beginner", "power", "unknown", "starter"];

/** Every tailored content key of a step that could carry its own copy. */
export function tailoredKeysForStep(funnel: string, tier: string): string[] {
  const step = findStep(funnel, tier);
  if (!step) return [];
  const keys = new Set<string>(step.contentKeys.filter((k) => k !== tier));
  for (const b of ALL_BASES) keys.add(`${tier}.${b}`);
  if (step.slot === "module") {
    for (const m of MODULE_KEYS) {
      keys.add(`${tier}.${MODULE_KEY_PREFIX}${m}`);
      for (const b of ALL_BASES) keys.add(`${tier}.${MODULE_KEY_PREFIX}${m}.${b}`);
    }
  }
  return [...keys].filter((k) => isValidContentKey(funnel, k));
}

/** Tailored keys of the step that have code copy or an active override. */
export function tailoredKeysWithCopy(
  funnel: string,
  tier: string,
  overrides: Map<string, FunnelOverride>,
): string[] {
  const vars = tokenVars(funnel);
  return tailoredKeysForStep(funnel, tier).filter(
    (k) => codeDefaultForExactKey(funnel, k, vars) !== null || isOverrideActive(overrides.get(`${funnel}:${k}`)),
  );
}

function tokenVars(funnel: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of findFunnel(funnel)?.vars ?? []) out[v] = `{{${v}}}`;
  return out;
}

export type PromoteResult =
  | { ok: true; wroteKey: string | null }
  | { ok: false; reason: "conflict" | "migration" | "invalid" | "error"; detail: string; tailoredKeys?: string[] };

/**
 * Writes the winning arm's copy into email_funnel_overrides at the
 * experiment's content key (its segment), stamped updated_by 'ab:auto <id8>'.
 * Arm 'a' (control) writes nothing. Refuses with 'conflict' when the
 * experiment has no segment (bare tier) and tailored copy exists for that
 * tier: a bare override never beats tailored code copy, so the promotion
 * would silently not apply to those tracks. Sequence groups are handled by
 * pauseSequenceLoser instead. Never throws.
 */
export async function promoteWinner(
  db: SupabaseClient,
  exp: Experiment,
  winner: AbArmKey,
  opts: { overrides?: Map<string, FunnelOverride>; now?: Date } = {},
): Promise<PromoteResult> {
  try {
    if (exp.kind !== "funnel_step" || !exp.funnel || !exp.tier) {
      return { ok: false, reason: "invalid", detail: "Not a funnel step experiment." };
    }
    if (winner === "a") return { ok: true, wroteKey: null };
    const arm = exp.arms.find((a) => a.arm === winner);
    const subject = arm?.subject && arm.subject.trim() ? arm.subject : null;
    const body = arm?.body && arm.body.trim() ? arm.body : null;
    if (!subject && !body) return { ok: false, reason: "invalid", detail: "Winning arm has no copy." };

    const key = exp.segment ? `${exp.tier}.${exp.segment}` : exp.tier;
    if (!isValidContentKey(exp.funnel, key)) {
      return { ok: false, reason: "invalid", detail: `Content key ${key} is not valid for ${exp.funnel}.` };
    }
    if (!exp.segment) {
      let overrides = opts.overrides;
      if (!overrides) {
        try {
          overrides = await loadFunnelOverrides(db);
        } catch {
          overrides = new Map();
        }
      }
      const tailored = tailoredKeysWithCopy(exp.funnel, exp.tier, overrides);
      if (tailored.length > 0) {
        return {
          ok: false,
          reason: "conflict",
          detail: `Tailored copy exists for ${exp.funnel} ${exp.tier} (${tailored.slice(0, 5).join(", ")}${tailored.length > 5 ? ", ..." : ""}); a bare-tier override would not reach those tracks. Apply the winner per track by hand.`,
          tailoredKeys: tailored,
        };
      }
    }

    const nowIso = (opts.now ?? new Date()).toISOString();
    const row: Record<string, unknown> = { funnel: exp.funnel, tier: key, enabled: true };
    if (subject) row.subject = subject;
    if (body) row.body = body;
    const stamped = { ...row, updated_at: nowIso, updated_by: `${AB_ACTOR} ${shortId(exp.id)}` };
    let { error } = await db.from("email_funnel_overrides").upsert(stamped, { onConflict: "funnel,tier" });
    if (error && isMissingColumn(error)) {
      ({ error } = await db.from("email_funnel_overrides").upsert(row, { onConflict: "funnel,tier" }));
    }
    if (error) {
      if (isMissingRelation(error)) return { ok: false, reason: "migration", detail: "email_funnel_overrides is missing." };
      return { ok: false, reason: "error", detail: error.message ?? "upsert failed" };
    }
    return { ok: true, wroteKey: key };
  } catch (err) {
    return { ok: false, reason: "error", detail: String(err) };
  }
}

/** Pauses the losing sequence of a decided sequence group. */
async function pauseSequenceLoser(
  db: SupabaseClient,
  loserId: string,
  winnerName: string,
): Promise<boolean> {
  const reason = `A/B loser vs ${winnerName}`.slice(0, 200);
  let { error } = await db
    .from("email_sequences")
    .update({ status: "paused", pause_reason: reason })
    .eq("id", loserId)
    .eq("status", "active");
  if (error && isMissingColumn(error)) {
    ({ error } = await db.from("email_sequences").update({ status: "paused" }).eq("id", loserId).eq("status", "active"));
  }
  if (error) {
    console.error("email-experiments: pause loser failed", error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** YYYY-MM-DD and hour in America/Denver. */
export function denverDayParts(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DENVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

export type EvaluateSummary = {
  ran: boolean;
  skipped?: string;
  evaluated: number;
  looks: number;
  decided: number;
  stopped: number;
  promoted: number;
  conflicts: number;
  projectionWarnings: number;
  sequenceGroupsCreated: number;
  sequenceLosersPaused: number;
  errors: number;
};

/** Claims today's app_config marker. false when already claimed or app_config is unusable. */
async function claimDailyMarker(db: SupabaseClient, key: string, now: Date): Promise<boolean> {
  const { error } = await db.from("app_config").insert({
    key,
    value: { started_at: now.toISOString() },
    updated_at: now.toISOString(),
    updated_by: "cron:ab-evaluate",
  });
  if (!error) return true;
  if (error.code !== "23505") console.error("email-experiments: marker claim failed", error);
  return false;
}

async function markerExists(db: SupabaseClient, key: string): Promise<boolean> {
  const { data, error } = await db.from("app_config").select("key").eq("key", key).maybeSingle();
  if (error) return true; // unreadable: treat as set so we never spam
  return Boolean(data);
}

async function setMarker(db: SupabaseClient, key: string, value: Record<string, unknown>, now: Date): Promise<void> {
  try {
    await db.from("app_config").upsert(
      { key, value, updated_at: now.toISOString(), updated_by: "cron:ab-evaluate" },
      { onConflict: "key" },
    );
  } catch {
    // best-effort
  }
}

async function updateExperiment(db: SupabaseClient, id: string, patch: Record<string, unknown>, now: Date): Promise<boolean> {
  const { error } = await db
    .from("email_experiments")
    .update({ ...patch, updated_at: now.toISOString(), updated_by: AB_ACTOR })
    .eq("id", id);
  if (error) {
    console.error("email-experiments: update failed", error);
    return false;
  }
  return true;
}

function scopeLabel(exp: Experiment): string {
  if (exp.kind === "sequence_group") return `Sequence group ${exp.baseTag ?? "?"}`;
  const fname = findFunnel(exp.funnel ?? "")?.name ?? exp.funnel ?? "?";
  return `${fname}, ${exp.tier ?? "?"} (${exp.segment ? `segment ${exp.segment}` : "everyone"})`;
}

function emailArms(exp: Experiment, stats: ArmStats[] | null, labels?: Record<string, string>): AbEmailArm[] {
  return (stats ?? []).map((s) => {
    const m = s.metrics[exp.primaryMetric];
    const g = exp.guardrailMetric ? s.metrics[exp.guardrailMetric] : null;
    return {
      arm: s.arm,
      label: labels?.[s.arm] ?? (s.arm === "a" && exp.kind === "funnel_step" ? "control" : undefined),
      sent: s.sent,
      x: m?.x ?? 0,
      n: m?.n ?? 0,
      guardrailRate: g && g.n > 0 ? g.x / g.n : null,
    };
  });
}

function decisionJson(d: DecideResult, exp: Experiment, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outcome: d.outcome ?? null,
    metric: exp.primaryMetric,
    guardrail: exp.guardrailMetric,
    z: Number.isFinite(d.z) ? Number(d.z.toFixed(4)) : 0,
    p: Number.isFinite(d.pValue) ? Number(d.pValue.toFixed(6)) : 1,
    alpha: d.alpha,
    look: d.look,
    rates: d.rates,
    sends: d.sends,
    matured: d.matured,
    reason: d.reason,
    ...(d.candidate ? { candidate: d.candidate } : {}),
    ...extra,
  };
}

/**
 * True when a running test must stop because the price change passed: it
 * started before the effective date and one arm's copy uses
 * {{priceLockLine}} while the other does not (the line vanishes from one
 * side mid-test, so the comparison changes). The control's template is
 * checked via its resolved override/code copy at the content key.
 */
export function priceLockStopNeeded(
  exp: Experiment,
  now: number,
  controlTemplate: { subject: string; body: string } | null,
): boolean {
  if (priceChangeActive(now)) return false;
  const startMs = exp.startedAt ? Date.parse(exp.startedAt) : NaN;
  if (Number.isFinite(startMs) && startMs >= Date.parse(PRICE_CHANGE.effectiveAt)) return false;
  const uses = (s: string | null | undefined) => Boolean(s && PRICE_LOCK_TOKEN_RE.test(s));
  const armUses = (a: ExperimentArm | undefined, fallback: { subject: string; body: string } | null) => {
    const subj = a?.subject && a.subject.trim() ? a.subject : fallback?.subject;
    const body = a?.body && a.body.trim() ? a.body : fallback?.body;
    return uses(subj) || uses(body);
  };
  const a = exp.arms.find((x) => x.arm === "a");
  const b = exp.arms.find((x) => x.arm === "b");
  const aUses = armUses(a, controlTemplate);
  const bUses = armUses(b, controlTemplate);
  // Explicit arm copy using the token is always a stop (should never pass
  // validation, but rows can be written by hand).
  if (uses(a?.subject) || uses(a?.body) || uses(b?.subject) || uses(b?.body)) return true;
  return aUses !== bUses;
}

/** Control template (tokens kept) for a funnel-step experiment. */
function controlTemplateFor(exp: Experiment, overrides: Map<string, FunnelOverride>): { subject: string; body: string } | null {
  if (!exp.funnel || !exp.contentKey) return null;
  try {
    const vars = tokenVars(exp.funnel);
    const r = resolveFunnelCopyForKey({
      funnel: exp.funnel,
      contentKey: exp.contentKey,
      vars,
      overrides,
      codeDefaultForKey: makeCodeDefaultForKey(exp.funnel, vars),
    });
    if (r.subject || r.body) return { subject: r.subject, body: r.body };
    const d = funnelDefaultsForKey(exp.funnel, exp.contentKey, vars);
    return { subject: d.subject, body: d.body };
  } catch {
    return null;
  }
}

/**
 * Warns the founder once (app_config ab_projection_<id>) when a running test
 * is projected not to reach minSendsPerArm within maxDays, from the last 14
 * days' send rate of its step. Returns true when a warning was sent.
 */
export async function notifyIfUnreachable(db: SupabaseClient, exp: Experiment, now: Date = new Date()): Promise<boolean> {
  try {
    if (exp.status !== "running") return false;
    const marker = `ab_projection_${exp.id}`;
    if (await markerExists(db, marker)) return false;

    const sinceIso = new Date(now.getTime() - PROJECTION_LOOKBACK_DAYS * DAY_MS).toISOString();
    let recent: number | null = null;
    if (exp.kind === "funnel_step" && exp.funnel && exp.tier) {
      const step = findStep(exp.funnel, exp.tier);
      if (!step) return false;
      let q = db
        .from("email_sends")
        .select("id", { count: "exact", head: true })
        .eq("category", step.category)
        .eq("status", "sent")
        .gte("created_at", sinceIso);
      if (exp.segment && exp.contentKey) q = q.eq("step_key", exp.contentKey);
      let res = await q;
      if (res.error && exp.segment && isMissingColumn(res.error)) {
        // No step_key yet: the whole tier's rate is an upper bound, so a
        // warning from it is still a real warning.
        res = await db
          .from("email_sends")
          .select("id", { count: "exact", head: true })
          .eq("category", step.category)
          .eq("status", "sent")
          .gte("created_at", sinceIso);
      }
      if (res.error) return false;
      recent = res.count ?? 0;
    } else if (exp.kind === "sequence_group") {
      let total = 0;
      for (const arm of exp.arms) {
        if (!arm.sequenceId) continue;
        const res = await db
          .from("email_sends")
          .select("id", { count: "exact", head: true })
          .eq("category", `seq_${shortId(arm.sequenceId)}_s1`)
          .eq("status", "sent")
          .gte("created_at", sinceIso);
        if (res.error) return false;
        total += res.count ?? 0;
      }
      recent = total;
    }
    if (recent === null) return false;

    const startMs = exp.startedAt ? Date.parse(exp.startedAt) : now.getTime();
    const daysLeft = Math.max(0, exp.maxDays - (now.getTime() - startMs) / DAY_MS);
    const projected = projectSendsPerArm({
      recentSends: recent,
      recentDays: PROJECTION_LOOKBACK_DAYS,
      maxDays: daysLeft,
      arms: Math.max(2, exp.arms.length),
    });
    await setMarker(db, marker, { projected, recent, checked_at: now.toISOString() }, now);
    if (projected >= exp.minSendsPerArm) return false;
    await sendAbDecisionEmail({
      kind: "projection",
      name: exp.name || scopeLabel(exp),
      scope: scopeLabel(exp),
      primaryMetric: exp.primaryMetric,
      projectedPerArm: projected,
      minSendsPerArm: exp.minSendsPerArm,
      maxDays: Math.round(daysLeft),
    });
    return true;
  } catch (err) {
    console.error("email-experiments: projection check failed", err);
    return false;
  }
}

// Sequence -a/-b variant groups (mirrors VARIANT_TAG_RE in
// src/app/api/admin/emails/sequences/route.ts).
const VARIANT_TAG_RE = /^(.+)-([a-z])$/;

type SeqRow = { id: string; name: string; status: string; trigger: unknown; created_at: string };

/** Active 2-sibling variant groups: base tag -> [arm a seq, arm b seq] by suffix order. */
export function findVariantGroups(sequences: readonly SeqRow[]): Map<string, SeqRow[]> {
  const groups = new Map<string, SeqRow[]>();
  for (const s of sequences) {
    if (s.status !== "active") continue;
    const t = s.trigger as { kind?: unknown; tag?: unknown } | null;
    if (!t || t.kind !== "tag_added" || typeof t.tag !== "string") continue;
    const m = VARIANT_TAG_RE.exec(t.tag.trim().toLowerCase());
    if (!m) continue;
    const list = groups.get(m[1]) ?? [];
    list.push(s);
    groups.set(m[1], list);
  }
  const tagOf = (s: SeqRow) => String((s.trigger as { tag?: string }).tag ?? "");
  for (const [k, list] of groups) {
    list.sort((x, y) => tagOf(x).localeCompare(tagOf(y)));
    groups.set(k, list);
  }
  return groups;
}

/** Ensures each active 2-sibling sequence group has a running experiment;
 * stops group experiments whose arms no longer match the active siblings. */
async function syncSequenceGroups(
  db: SupabaseClient,
  running: Experiment[],
  now: Date,
  summary: EvaluateSummary,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const { data, error } = await db
    .from("email_sequences")
    .select("id, name, status, trigger, created_at")
    .limit(500)
    .returns<SeqRow[]>();
  if (error) return names;
  for (const s of data ?? []) names.set(s.id, s.name);
  const groups = findVariantGroups(data ?? []);

  // Stop group tests whose siblings changed (one paused, deleted, or a third added).
  for (const exp of running) {
    if (exp.kind !== "sequence_group" || !exp.baseTag) continue;
    const active = groups.get(exp.baseTag) ?? [];
    const armIds = exp.arms.map((a) => a.sequenceId).sort().join(",");
    const activeIds = active.map((s) => s.id).sort().join(",");
    if (active.length !== 2 || armIds !== activeIds) {
      if (await updateExperiment(db, exp.id, {
        status: "stopped",
        ended_at: now.toISOString(),
        decision: { outcome: "inconclusive", reason: "Sequence group changed (sibling paused, removed or added)." },
      }, now)) summary.stopped += 1;
      exp.status = "stopped";
    }
  }

  // A pair that was already tested (decided, or stopped by hand) is never
  // re-tested automatically: an inconclusive pair would otherwise restart
  // every day it stays active.
  const finished = (await loadExperiments(db, { kind: "sequence_group", statuses: ["decided", "stopped"], limit: 500 })) ?? [];
  const pairKey = (ids: (string | null)[]) => ids.filter(Boolean).sort().join(",");
  const testedPairs = new Set(finished.map((e) => `${e.baseTag}|${pairKey(e.arms.map((a) => a.sequenceId))}`));

  for (const [baseTag, seqs] of groups) {
    if (seqs.length !== 2) continue; // arms are 'a' | 'b' only
    if (running.some((e) => e.kind === "sequence_group" && e.baseTag === baseTag && e.status === "running")) continue;
    if (testedPairs.has(`${baseTag}|${pairKey(seqs.map((s) => s.id))}`)) continue;
    const { data: created, error: insErr } = await db
      .from("email_experiments")
      .insert({
        kind: "sequence_group",
        name: `Sequence group ${baseTag}`,
        base_tag: baseTag,
        primary_metric: "click",
        guardrail_metric: "paid",
        status: "running",
        min_sends_per_arm: DEFAULT_MIN_SENDS_PER_ARM,
        max_days: DEFAULT_MAX_DAYS,
        conversion_window_days: DEFAULT_CONVERSION_WINDOW_DAYS,
        started_at: now.toISOString(),
        created_by: AB_ACTOR,
        updated_by: AB_ACTOR,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      if (insErr && insErr.code !== "23505") console.error("email-experiments: group create failed", insErr);
      continue;
    }
    const id = (created as { id: string }).id;
    const { error: armErr } = await db.from("email_experiment_arms").insert([
      { experiment_id: id, arm: "a", sequence_id: seqs[0].id },
      { experiment_id: id, arm: "b", sequence_id: seqs[1].id },
    ]);
    if (armErr) {
      console.error("email-experiments: group arms create failed", armErr);
      await db.from("email_experiments").delete().eq("id", id);
      continue;
    }
    summary.sequenceGroupsCreated += 1;
    running.push({
      id,
      kind: "sequence_group",
      name: `Sequence group ${baseTag}`,
      funnel: null,
      tier: null,
      contentKey: null,
      segment: null,
      baseTag,
      primaryMetric: "click",
      guardrailMetric: "paid",
      status: "running",
      minSendsPerArm: DEFAULT_MIN_SENDS_PER_ARM,
      maxDays: DEFAULT_MAX_DAYS,
      conversionWindowDays: DEFAULT_CONVERSION_WINDOW_DAYS,
      looksDone: 0,
      lastLookAt: null,
      startedAt: now.toISOString(),
      endedAt: null,
      decidedAt: null,
      winnerArm: null,
      decision: null,
      createdBy: AB_ACTOR,
      createdAt: now.toISOString(),
      updatedBy: AB_ACTOR,
      updatedAt: now.toISOString(),
      arms: [
        { arm: "a", subject: null, body: null, sequenceId: seqs[0].id },
        { arm: "b", subject: null, body: null, sequenceId: seqs[1].id },
      ],
    });
  }
  return names;
}

/** One experiment's daily evaluation. */
async function evaluateOne(
  db: SupabaseClient,
  exp: Experiment,
  now: Date,
  overrides: Map<string, FunnelOverride>,
  seqNames: Map<string, string>,
  summary: EvaluateSummary,
): Promise<void> {
  const nowMs = now.getTime();
  summary.evaluated += 1;

  if (exp.kind === "funnel_step") {
    // The step or key was removed from code: close the test.
    if (!exp.funnel || !exp.contentKey || !isValidContentKey(exp.funnel, exp.contentKey)) {
      if (await updateExperiment(db, exp.id, {
        status: "stopped",
        ended_at: now.toISOString(),
        decision: { outcome: "inconclusive", reason: "The funnel step no longer exists." },
      }, now)) summary.stopped += 1;
      return;
    }
    // Price change passed while the arms differ on {{priceLockLine}}.
    if (priceLockStopNeeded(exp, nowMs, controlTemplateFor(exp, overrides))) {
      const reason = "The price change took effect, and this test's arms differ on {{priceLockLine}}, so the comparison is no longer fair.";
      if (await updateExperiment(db, exp.id, {
        status: "stopped",
        ended_at: now.toISOString(),
        decision: { outcome: "inconclusive", reason, auto: "price_change" },
      }, now)) summary.stopped += 1;
      await sendAbDecisionEmail({
        kind: "auto-stop",
        name: exp.name || scopeLabel(exp),
        scope: scopeLabel(exp),
        primaryMetric: exp.primaryMetric,
        reason,
      });
      return;
    }
  }

  if (await notifyIfUnreachable(db, exp, now)) summary.projectionWarnings += 1;

  const startMs = exp.startedAt ? Date.parse(exp.startedAt) : NaN;
  const pastMax = Number.isFinite(startMs) && (nowMs - startMs) / DAY_MS >= exp.maxDays;
  if (!pastMax && !lookDue(exp.lastLookAt, nowMs)) return;

  const stats = await loadArmStats(db, exp, nowMs);
  const decision = decideExperiment({
    arms: stats ?? [],
    primaryMetric: exp.primaryMetric,
    guardrail: exp.guardrailMetric,
    minSends: exp.minSendsPerArm,
    looksDone: exp.looksDone,
    startedAt: exp.startedAt,
    maxDays: exp.maxDays,
    now: nowMs,
  });

  const patch: Record<string, unknown> = {};
  if (decision.lookTaken) {
    patch.looks_done = decision.look;
    patch.last_look_at = now.toISOString();
    summary.looks += 1;
  }

  const labels: Record<string, string> = {};
  if (exp.kind === "sequence_group") {
    for (const a of exp.arms) if (a.sequenceId) labels[a.arm] = seqNames.get(a.sequenceId) ?? a.sequenceId;
  }

  if (decision.action === "continue") {
    if (Object.keys(patch).length > 0) await updateExperiment(db, exp.id, patch, now);
    return;
  }

  if (decision.action === "decide" && decision.winner) {
    const winner = decision.winner;
    let whatChanged = "";
    let extra: Record<string, unknown> = {};
    let winnerArm: AbArmKey | null = winner;
    let outcome = decision.outcome ?? "promote";

    if (exp.kind === "funnel_step") {
      const res = await promoteWinner(db, exp, winner, { overrides, now });
      if (res.ok) {
        whatChanged = res.wroteKey
          ? `Arm B's copy is now the override for ${exp.funnel} ${res.wroteKey} (updated by ab:auto).`
          : "Control won, so nothing was changed.";
        extra = { promotedKey: res.wroteKey };
        if (res.wroteKey) summary.promoted += 1;
      } else {
        outcome = "conflict";
        winnerArm = null;
        whatChanged = `Nothing was written: ${res.detail}`;
        extra = { candidate: winner, promoteError: res.reason, detail: res.detail };
        summary.conflicts += 1;
      }
    } else {
      const loser = exp.arms.find((a) => a.arm !== winner);
      const win = exp.arms.find((a) => a.arm === winner);
      const winName = win?.sequenceId ? seqNames.get(win.sequenceId) ?? win.sequenceId : winner;
      if (loser?.sequenceId && (await pauseSequenceLoser(db, loser.sequenceId, winName))) {
        summary.sequenceLosersPaused += 1;
        whatChanged = `Paused the losing sequence "${seqNames.get(loser.sequenceId) ?? loser.sequenceId}". New enrollments go to "${winName}".`;
        extra = { pausedSequenceId: loser.sequenceId };
      } else {
        whatChanged = "Could not pause the losing sequence; please pause it by hand.";
      }
    }

    await updateExperiment(db, exp.id, {
      ...patch,
      status: "decided",
      decided_at: now.toISOString(),
      ended_at: now.toISOString(),
      winner_arm: winnerArm,
      decision: { ...decisionJson(decision, exp, extra), outcome },
    }, now);
    summary.decided += 1;
    await sendAbDecisionEmail({
      kind: "decision",
      name: exp.name || scopeLabel(exp),
      scope: scopeLabel(exp),
      primaryMetric: exp.primaryMetric,
      guardrailMetric: exp.guardrailMetric,
      outcome,
      winner: winnerArm ?? winner,
      arms: emailArms(exp, stats, labels),
      pValue: decision.pValue,
      z: decision.z,
      alpha: decision.alpha,
      look: decision.look,
      maxLooks: MAX_LOOKS,
      whatChanged,
      reason: decision.reason,
    });
    return;
  }

  // stop-no-winner: inconclusive or guardrail conflict. Control stays.
  if (decision.outcome === "conflict") summary.conflicts += 1;
  await updateExperiment(db, exp.id, {
    ...patch,
    status: "decided",
    decided_at: now.toISOString(),
    ended_at: now.toISOString(),
    winner_arm: null,
    decision: decisionJson(decision, exp),
  }, now);
  summary.decided += 1;
  await sendAbDecisionEmail({
    kind: "decision",
    name: exp.name || scopeLabel(exp),
    scope: scopeLabel(exp),
    primaryMetric: exp.primaryMetric,
    guardrailMetric: exp.guardrailMetric,
    outcome: decision.outcome ?? "inconclusive",
    winner: decision.candidate ?? null,
    arms: emailArms(exp, stats, labels),
    pValue: decision.pValue,
    z: decision.z,
    alpha: decision.alpha,
    look: decision.look,
    maxLooks: MAX_LOOKS,
    whatChanged:
      exp.kind === "sequence_group"
        ? "Nothing was paused. Both sequences keep running; split-enroll still alternates."
        : "Nothing was written. The control copy keeps sending to everyone.",
    reason: decision.reason,
  });
}

/**
 * Daily A/B evaluation, called from the email-marketing cron. Runs at most once
 * per America/Denver day, from 9am Denver, claimed via the app_config marker
 * `ab_evaluate_YYYY-MM-DD` (inserted first, so overlapping cron runs cannot
 * both evaluate). `force` skips the hour gate and marker (admin manual run).
 * Never throws.
 */
export async function evaluateExperiments(
  db: SupabaseClient,
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<EvaluateSummary> {
  const summary: EvaluateSummary = {
    ran: false,
    evaluated: 0,
    looks: 0,
    decided: 0,
    stopped: 0,
    promoted: 0,
    conflicts: 0,
    projectionWarnings: 0,
    sequenceGroupsCreated: 0,
    sequenceLosersPaused: 0,
    errors: 0,
  };
  try {
    // Dark until FUNNELS_V2=1: with the flag off nothing is evaluated, no
    // sequence group test is auto-created and no live sequence is paused,
    // even when the 20261110 migration is already applied.
    if (!funnelsV2Enabled()) return { ...summary, skipped: "flag-off" };
    if (!opts.force) {
      const { day, hour } = denverDayParts(now);
      if (hour < EVALUATE_FROM_HOUR) return { ...summary, skipped: "before-hour" };
      if (!(await claimDailyMarker(db, `ab_evaluate_${day}`, now))) return { ...summary, skipped: "already-ran" };
    }

    const running = await loadExperiments(db, { statuses: ["running"] });
    if (running === null) return { ...summary, skipped: "migration-pending" };
    summary.ran = true;

    let overrides = new Map<string, FunnelOverride>();
    try {
      overrides = await loadFunnelOverrides(db);
    } catch {
      // control-template checks fall back to code copy
    }

    let seqNames = new Map<string, string>();
    try {
      seqNames = await syncSequenceGroups(db, running, now, summary);
    } catch (err) {
      summary.errors += 1;
      console.error("email-experiments: sequence group sync failed", err);
    }

    for (const exp of running) {
      if (exp.status !== "running") continue;
      try {
        await evaluateOne(db, exp, now, overrides, seqNames, summary);
      } catch (err) {
        summary.errors += 1;
        console.error("email-experiments: evaluate failed", exp.id, err);
      }
    }
    clearExperimentCache();
    return summary;
  } catch (err) {
    console.error("email-experiments: evaluateExperiments threw", err);
    return { ...summary, errors: summary.errors + 1 };
  }
}
