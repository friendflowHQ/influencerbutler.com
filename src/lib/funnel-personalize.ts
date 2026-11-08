// Funnels v2 personalization: who gets which copy.
//
// Pure pieces (unit-tested in __tests__/funnel-personalize.test.ts):
//   selectBase      plan level + walkthrough tags -> base track
//   rankModules     walkthrough tags -> up to 3 ranked modules
//   buildTrackVars  base track -> the {{aiLine}} {{priceLockLine}} {{price}}
//                   {{beginnerPrice}} {{eventLine}} {{goalLine}} {{bookCallUrl}} vars
//   contentKeyForStep  which content key a step sends for an assignment
//
// DB pieces (all best-effort, never throw):
//   loadSubscriberSignals  tags + plan_level from email_subscribers (42703 fallback)
//   getAssignment          sticky (email, funnel) row in email_funnel_assignments;
//                          in-memory "unknown" assignment when the table is missing
//   lockAssignment / exitAssignment
//   loadNextEvent          next public scheduled event for {{eventLine}}
//
// Only the send path calls this, and only when funnelsV2Enabled(). Do not
// import system-funnels.ts here (copy files may import this module).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEVEL_PRICE_CENTS,
  PRICE_CHANGE,
  priceChangeActive,
  type Interval,
  type PlanLevel,
  type Tier,
} from "@/lib/pricing-constants";
import {
  contentKey,
  isModuleKey,
  isPlanBase,
  planBaseForLevel,
  PLAN_TAGS,
  type FunnelAssignment,
  type FunnelSlot,
  type ModuleKey,
  type PlanBase,
  type PlanLevelSource,
  type PlanLevelValue,
} from "@/lib/funnel-types";

const SITE_DEFAULT = "https://www.influencerbutler.com";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A person whose funnel entry is older than this when v2 starts is "in
 * flight": they keep base copy (track unknown) so their drip does not change
 * voice halfway through. */
export const IN_FLIGHT_AFTER_MS = 3 * DAY_MS;
export const MAX_MODULES = 3;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function errCode(error: unknown): string {
  return typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "") : "";
}

/** Postgres / PostgREST "column does not exist". */
export function isMissingColumnError(error: unknown): boolean {
  const c = errCode(error);
  return c === "42703" || c === "PGRST204";
}

/** Postgres / PostgREST "table does not exist". */
export function isMissingTableError(error: unknown): boolean {
  const c = errCode(error);
  return c === "42P01" || c === "PGRST205";
}

function normEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Base track
// ---------------------------------------------------------------------------

export const STARTER_TAGS = ["wt-exp-brand-new", "wt-goal-beginner-start"] as const;

/** Plan level read from the managed plan-* tag, when present. */
export function planLevelFromTags(tags: readonly string[] | null | undefined): PlanLevelValue | null {
  const set = new Set(tags ?? []);
  // Highest level wins if several are (wrongly) present.
  if (set.has(PLAN_TAGS.power)) return "power";
  if (set.has(PLAN_TAGS.legacy)) return "legacy";
  if (set.has(PLAN_TAGS.beginner)) return "beginner";
  return null;
}

/**
 * Base track for one person.
 *   - `starter` when the walkthrough says brand new (wt-exp-brand-new or
 *     wt-goal-beginner-start) AND the person has not bought a plan (a paid
 *     Beginner/Power subscriber keeps plan copy; source ls/comp or `paid`).
 *   - else the plan level: beginner, power (legacy reads as power), or
 *     unknown when nothing is known.
 * `planLevel` falls back to the plan-* tag when not given.
 */
export function selectBase(input: {
  planLevel?: PlanLevelValue | null;
  planLevelSource?: PlanLevelSource | null;
  tags?: readonly string[] | null;
  paid?: boolean;
}): PlanBase {
  const tags = input.tags ?? [];
  const level = input.planLevel ?? planLevelFromTags(tags);
  const paid = Boolean(input.paid) || input.planLevelSource === "ls" || input.planLevelSource === "comp";
  if (!paid && STARTER_TAGS.some((t) => tags.includes(t))) return "starter";
  return planBaseForLevel(level);
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/** Eligibility per v1 module, from walkthrough tags. */
const MODULE_RULES: Record<ModuleKey, (tags: Set<string>) => boolean> = {
  deals: (t) => t.has("wt-plat-deals-influencer"),
  "cc-auto": (t) => t.has("wt-goal-cc-auto-accept"),
  walmart: (t) => t.has("wt-plat-walmart"),
  video: (t) => t.has("wt-goal-video-marketplaces"),
  social: (t) => t.has("wt-plat-instagram") || t.has("wt-plat-facebook"),
  "amazon-offsite": (t) => t.has("wt-mode-offsite") || t.has("wt-mode-both"),
};

/** Precedence after the goal module (merged design: deals, cc-auto, walmart,
 * video, social), then the creator-mode module. */
export const MODULE_PRECEDENCE: readonly ModuleKey[] = ["deals", "cc-auto", "walmart", "video", "social", "amazon-offsite"];

/** The module the walkthrough goal points at, if any. */
const GOAL_MODULE: Record<string, ModuleKey> = {
  "wt-goal-cc-auto-accept": "cc-auto",
  "wt-goal-video-marketplaces": "video",
};

/**
 * Ranked modules (at most 3) for a person: the goal's module first, then
 * every other eligible module in MODULE_PRECEDENCE order. Deterministic, so a
 * re-run with the same tags gives the same list.
 */
export function rankModules(tags: readonly string[] | null | undefined, max = MAX_MODULES): ModuleKey[] {
  const set = new Set(tags ?? []);
  const out: ModuleKey[] = [];
  for (const [tag, mod] of Object.entries(GOAL_MODULE)) {
    if (set.has(tag) && !out.includes(mod)) out.push(mod);
  }
  for (const mod of MODULE_PRECEDENCE) {
    if (!out.includes(mod) && MODULE_RULES[mod](set)) out.push(mod);
  }
  return out.slice(0, Math.max(0, max));
}

// ---------------------------------------------------------------------------
// Content key per step
// ---------------------------------------------------------------------------

/**
 * Content key a step sends for this assignment. Base and urgency slots get
 * `tier.<track>`; a module slot gets `tier.mod-<modules[moduleIndex]>.<track>`,
 * or `tier.<track>` when the person has no module at that index. Resolution
 * (funnel-copy resolveFunnelCopyForKey) walks back to bare copy from there.
 */
export function contentKeyForStep(
  step: { tier: string; slot: FunnelSlot; moduleIndex?: number },
  assignment: { track: PlanBase; modules: readonly ModuleKey[] },
): string {
  const base = isPlanBase(assignment.track) ? assignment.track : "unknown";
  if (step.slot === "module" && typeof step.moduleIndex === "number") {
    const mod = assignment.modules[step.moduleIndex];
    if (mod && isModuleKey(mod)) return contentKey(step.tier, { module: mod, base });
  }
  return contentKey(step.tier, { base });
}

// ---------------------------------------------------------------------------
// Track variables
// ---------------------------------------------------------------------------

export type TrackVars = {
  aiLine: string;
  priceLockLine: string;
  price: string;
  beginnerPrice: string;
  eventLine: string;
  goalLine: string;
  bookCallUrl: string;
};

export type NextEventInfo = { id: string; title: string; startsAt: string; timezone: string };

/** "$24.99" / "$39" from cents. */
export function dollarsFromCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function priceCents(level: PlanLevel, tier: Tier, interval: Interval): number | null {
  const row = LEVEL_PRICE_CENTS[level][tier] ?? null;
  return row ? row[interval] : null;
}

function futurePriceCents(level: PlanLevel, tier: Tier, interval: Interval): number | null {
  const row = PRICE_CHANGE.prices[level]?.[tier] ?? null;
  return row ? row[interval] : null;
}

function perInterval(interval: Interval): string {
  return interval === "annual" ? "/year" : "/month";
}

/** "$24.99/month" for a level, falling back to Solo when the seat tier is not
 * sold on that level. "" if nothing is priced (never expected). */
function formatLevelPrice(level: PlanLevel, tier: Tier, interval: Interval): string {
  const cents = priceCents(level, tier, interval) ?? priceCents(level, "solo", interval);
  return cents == null ? "" : `${dollarsFromCents(cents)}${perInterval(interval)}`;
}

const LEVEL_LABEL: Record<PlanLevel, string> = { beginner: "Beginner", power: "Power User" };

/** One "Beginner goes from $24.99 to $29/month" clause, or null when that
 * level/tier has no announced change. */
function changeClause(level: PlanLevel, tier: Tier, interval: Interval): string | null {
  const now = priceCents(level, tier, interval);
  const next = futurePriceCents(level, tier, interval);
  if (now == null || next == null || next === now) return null;
  return `${LEVEL_LABEL[level]} goes from ${dollarsFromCents(now)} to ${dollarsFromCents(next)}${perInterval(interval)}`;
}

/** "{{priceLockLine}}": the price-rise notice while PRICE_CHANGE is ahead,
 * "" once it has passed (so copy expires on its own) or when this person's
 * plan is not changing. Never part of an A/B arm. */
export function buildPriceLockLine(base: PlanBase, tier: Tier = "solo", interval: Interval = "monthly", now = Date.now()): string {
  if (!priceChangeActive(now)) return "";
  const levels: PlanLevel[] = base === "beginner" ? ["beginner"] : base === "power" ? ["power"] : ["beginner", "power"];
  // Only the person's own seat tier: Power Team / Agency are not changing, so
  // they get no notice at all.
  const clauses = levels
    .map((l) => changeClause(l, tier, interval))
    .filter((c): c is string => Boolean(c));
  if (clauses.length === 0) return "";
  const when = new Date(PRICE_CHANGE.effectiveAt).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
    timeZoneName: "short",
  });
  return (
    `Heads up: prices for new subscriptions go up on ${when.replace(/, (\d)/, " at $1")} (${clauses.join(", ")}). ` +
    `Start before then and you keep today's price for as long as you stay subscribed.`
  );
}

const GOAL_LINES: Record<string, string> = {
  // Statements of the goal the person picked, never claims about the email
  // itself: the line drops into fixed copy, so "this one starts there" would
  // be untrue wherever the rest of the email is about something else.
  "wt-goal-cc-auto-accept":
    "You picked auto-accepting Creator Connections and SPCC campaigns in the walkthrough. Daily Commission Butler is the butler that does that.",
  "wt-goal-video-marketplaces":
    "You picked uploading your Amazon videos to other country marketplaces in the walkthrough: the app can re-post your US storefront videos to Canada, the UK, Australia and Singapore.",
  "wt-goal-photo-marketplaces":
    "You picked uploading your Amazon photos to other country marketplaces in the walkthrough: the app can fan your US storefront photos out to your other marketplaces.",
  "wt-goal-beginner-start": "You picked starting with the basics in the walkthrough, which is the right way in.",
  "wt-goal-everything": "You picked a bit of everything in the walkthrough, so take it one butler at a time.",
};

/** "{{goalLine}}" from the walkthrough goal tag, "" when none. */
export function buildGoalLine(tags: readonly string[] | null | undefined): string {
  for (const t of tags ?? []) {
    const line = GOAL_LINES[t];
    if (line) return line;
  }
  return "";
}

const AI_LINES: Record<PlanBase, string> = {
  beginner:
    "AI is included on Beginner: 150 AI actions a month on our key, so there is no OpenAI account to set up.",
  power:
    "Power User runs unlimited AI on your own OpenAI key (you pay OpenAI directly, a few dollars a month for most creators).",
  unknown:
    "AI is included on Beginner (150 AI actions a month on our key). Power User runs unlimited AI on your own OpenAI key.",
  starter:
    "AI is included on Beginner (150 AI actions a month on our key), so you can start without an OpenAI account.",
};

/** "{{eventLine}}" for the next upcoming event (only one that has not started
 * yet), "" when there is none. */
export function buildEventLine(event: NextEventInfo | null | undefined, site = SITE_DEFAULT, now = Date.now()): string {
  if (!event || !event.id || !event.title) return "";
  const startMs = Date.parse(event.startsAt);
  if (!Number.isFinite(startMs) || startMs <= now) return "";
  const when = formatWhen(event.startsAt, event.timezone);
  const url = `${site.replace(/\/$/, "")}/events/${event.id}`;
  return `Our next live group call is "${event.title}"${when ? ` on ${when}` : ""}. Save your seat: ${url}`;
}

/** Same output shape as events.ts formatEventWhen ("Thu, Oct 29 at 11:00 AM
 * MDT"); inlined so this module stays free of server-only imports. */
function formatWhen(startsAt: string, timezone: string): string {
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Date(ms).toLocaleString("en-US", { ...opts, timeZone: timezone || "America/Denver" }).replace(/, (\d{1,2}:\d{2})/, " at $1");
  } catch {
    return new Date(ms).toLocaleString("en-US", { ...opts, timeZone: "America/Denver" }).replace(/, (\d{1,2}:\d{2})/, " at $1");
  }
}

/**
 * The seven per-track template vars. Pure: pass `nextEvent` from
 * loadNextEvent(). `price` is always the Power User price for the person's
 * seat tier and interval (`beginnerPrice` is the Beginner one); `bookCallUrl` is set for Power only, since 1:1
 * calls are a Power User perk.
 */
export function buildTrackVars(input: {
  base: PlanBase;
  tags?: readonly string[] | null;
  seatTier?: Tier | null;
  interval?: Interval | null;
  nextEvent?: NextEventInfo | null;
  site?: string;
  now?: number;
}): TrackVars {
  const base = isPlanBase(input.base) ? input.base : "unknown";
  const tier: Tier = input.seatTier ?? "solo";
  const interval: Interval = input.interval ?? "monthly";
  const now = input.now ?? Date.now();
  const site = (input.site ?? SITE_DEFAULT).replace(/\/$/, "");
  return {
    aiLine: AI_LINES[base],
    priceLockLine: buildPriceLockLine(base, tier, interval, now),
    // Always the Power User price: every piece of copy quotes {{price}} as
    // "Power User is {{price}}" next to {{beginnerPrice}}, on every track.
    price: formatLevelPrice("power", tier, interval),
    beginnerPrice: formatLevelPrice("beginner", tier, interval),
    eventLine: buildEventLine(input.nextEvent ?? null, site, now),
    goalLine: buildGoalLine(input.tags),
    bookCallUrl: base === "power" ? `${site}/dashboard/book` : "",
  };
}

/** Power User tools a module points at (all Power-only per the desktop plan
 * catalog), for the upgrade funnel's {{toolsLine}}. */
const UPGRADE_TOOL_FOR_MODULE: Record<ModuleKey, string> = {
  walmart: "Walmart Butler",
  deals: "WAL Deals Finder",
  social: "Social Posting Butler",
  video: "YouTube Butler",
  "cc-auto": "Messenger Butler for your Creator Connections inbox",
  "amazon-offsite": "Instagram Butler for DMs",
};
const UPGRADE_TOOL_DEFAULTS = ["Walmart Butler", "Social Posting Butler", "YouTube Butler"];

/** "{{toolsLine}}" for the upgrade funnel: three Power User tools, the
 * person's modules first, e.g. "Walmart Butler, Social Posting Butler and
 * YouTube Butler". */
export function buildUpgradeToolsLine(modules: readonly string[] | null | undefined): string {
  const tools: string[] = [];
  for (const m of modules ?? []) {
    const tool = isModuleKey(m) ? UPGRADE_TOOL_FOR_MODULE[m] : null;
    if (tool && !tools.includes(tool)) tools.push(tool);
  }
  for (const t of UPGRADE_TOOL_DEFAULTS) if (!tools.includes(t)) tools.push(t);
  const three = tools.slice(0, 3);
  return `${three.slice(0, -1).join(", ")} and ${three[three.length - 1]}`;
}

// ---------------------------------------------------------------------------
// DB: subscriber signals
// ---------------------------------------------------------------------------

export type SubscriberSignals = {
  tags: string[];
  planLevel: PlanLevelValue | null;
  planLevelSource: PlanLevelSource | null;
};

const PLAN_LEVELS = new Set(["beginner", "power", "legacy"]);
const PLAN_SOURCES = new Set(["ls", "comp", "intent", "inferred"]);

/** Tags + plan_level for an email. plan_level/plan_level_source come from
 * 20261109 (missing column -> tags only); the plan-* tag fills plan level
 * when the column is empty. Any error -> empty signals. */
export async function loadSubscriberSignals(db: SupabaseClient, email: string): Promise<SubscriberSignals> {
  const empty: SubscriberSignals = { tags: [], planLevel: null, planLevelSource: null };
  const addr = normEmail(email);
  if (!addr) return empty;
  try {
    let row: Record<string, unknown> | null = null;
    for (const sel of ["tags,plan_level,plan_level_source", "tags"]) {
      const res = await db.from("email_subscribers").select(sel).eq("email", addr).maybeSingle();
      if (!res.error) {
        row = (res.data as Record<string, unknown> | null) ?? null;
        break;
      }
      if (!isMissingColumnError(res.error)) return empty;
    }
    if (!row) return empty;
    const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const col = typeof row.plan_level === "string" && PLAN_LEVELS.has(row.plan_level) ? (row.plan_level as PlanLevelValue) : null;
    const src =
      typeof row.plan_level_source === "string" && PLAN_SOURCES.has(row.plan_level_source)
        ? (row.plan_level_source as PlanLevelSource)
        : null;
    return { tags, planLevel: col ?? planLevelFromTags(tags), planLevelSource: col ? src : null };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// DB: assignments
// ---------------------------------------------------------------------------

export type AssignmentResult = FunnelAssignment & {
  /** false when the row could not be read or written (missing table, error):
   * the assignment is in-memory only. */
  persisted: boolean;
};

function rowToAssignment(row: Record<string, unknown>, email: string, funnel: string): AssignmentResult {
  const track = isPlanBase(row.track) ? row.track : "unknown";
  const modules = Array.isArray(row.modules) ? (row.modules as unknown[]).filter(isModuleKey).slice(0, MAX_MODULES) : [];
  return {
    email,
    funnel,
    track,
    modules,
    lockedAt: typeof row.locked_at === "string" ? row.locked_at : null,
    exitedAt: typeof row.exited_at === "string" ? row.exited_at : null,
    exitReason: typeof row.exit_reason === "string" ? row.exit_reason : null,
    persisted: true,
  };
}

/** The assignment used when nothing can be stored: base copy for everyone. */
export function fallbackAssignment(email: string, funnel: string): AssignmentResult {
  return {
    email: normEmail(email),
    funnel,
    track: "unknown",
    modules: [],
    lockedAt: null,
    exitedAt: null,
    exitReason: null,
    persisted: false,
  };
}

/** True when the funnel entry predates v2 by more than IN_FLIGHT_AFTER_MS. */
export function isInFlight(entryAtMs: number | null | undefined, v2StartMs: number): boolean {
  if (entryAtMs == null || !Number.isFinite(entryAtMs)) return false;
  return entryAtMs < v2StartMs - IN_FLIGHT_AFTER_MS;
}

function sameModules(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/**
 * Sticky (email, funnel) assignment.
 *   - Existing locked or exited row: returned unchanged (frozen).
 *   - Existing unlocked row: refreshed to `computed` (walkthrough answers may
 *     have arrived since), still unlocked.
 *   - No row: inserted from `computed`. An in-flight person (entry more than 3
 *     days before v2 started) is inserted as track "unknown" with the computed
 *     modules and locked_at = now, so their drip keeps its voice.
 * Locking for everyone else happens after their first module slot sends
 * (lockAssignment). Missing table (42P01 / PGRST205) or any other error ->
 * fallbackAssignment (track "unknown", no modules, persisted false).
 */
export async function getAssignment(
  db: SupabaseClient,
  args: {
    email: string;
    funnel: string;
    computed: { track: PlanBase; modules: readonly ModuleKey[] };
    inFlight?: boolean;
    now?: number;
  },
): Promise<AssignmentResult> {
  const email = normEmail(args.email);
  const funnel = args.funnel;
  if (!email) return fallbackAssignment(email, funnel);
  const nowIso = new Date(args.now ?? Date.now()).toISOString();
  const track: PlanBase = args.inFlight ? "unknown" : isPlanBase(args.computed.track) ? args.computed.track : "unknown";
  const modules = args.computed.modules.filter(isModuleKey).slice(0, MAX_MODULES);
  try {
    const read = await db
      .from("email_funnel_assignments")
      .select("track,modules,locked_at,exited_at,exit_reason")
      .eq("email", email)
      .eq("funnel", funnel)
      .maybeSingle();
    if (read.error) return fallbackAssignment(email, funnel);

    if (read.data) {
      const current = rowToAssignment(read.data as Record<string, unknown>, email, funnel);
      if (current.lockedAt || current.exitedAt) return current;
      if (current.track === track && sameModules(current.modules, modules)) return current;
      const upd = await db
        .from("email_funnel_assignments")
        .update({ track, modules, updated_at: nowIso })
        .eq("email", email)
        .eq("funnel", funnel)
        .is("locked_at", null);
      if (upd.error) return { ...current, persisted: true };
      return { ...current, track, modules };
    }

    const row = {
      email,
      funnel,
      track,
      modules,
      locked_at: args.inFlight ? nowIso : null,
      assigned_at: nowIso,
      updated_at: nowIso,
    };
    const ins = await db
      .from("email_funnel_assignments")
      .upsert(row, { onConflict: "email,funnel", ignoreDuplicates: true });
    if (ins.error) return fallbackAssignment(email, funnel);
    return {
      email,
      funnel,
      track,
      modules,
      lockedAt: row.locked_at,
      exitedAt: null,
      exitReason: null,
      persisted: true,
    };
  } catch {
    return fallbackAssignment(email, funnel);
  }
}

/** Freezes an assignment (first module slot sent). Best-effort, no-op if
 * already locked or the table is missing. */
export async function lockAssignment(db: SupabaseClient, email: string, funnel: string, now = Date.now()): Promise<void> {
  const addr = normEmail(email);
  if (!addr) return;
  try {
    const iso = new Date(now).toISOString();
    await db
      .from("email_funnel_assignments")
      .update({ locked_at: iso, updated_at: iso })
      .eq("email", addr)
      .eq("funnel", funnel)
      .is("locked_at", null);
  } catch {
    // best-effort
  }
}

/** Records that a person left a funnel (superseded by a higher funnel,
 * plan changed, ...). Exits live here, never as a *_converted_at stamp.
 * Best-effort; keeps the first exit if one is already recorded. */
export async function exitAssignment(
  db: SupabaseClient,
  args: { email: string; funnel: string; reason: string; now?: number },
): Promise<void> {
  const email = normEmail(args.email);
  if (!email) return;
  const iso = new Date(args.now ?? Date.now()).toISOString();
  try {
    const ins = await db.from("email_funnel_assignments").upsert(
      { email, funnel: args.funnel, track: "unknown", modules: [], exited_at: iso, exit_reason: args.reason, assigned_at: iso, updated_at: iso },
      { onConflict: "email,funnel", ignoreDuplicates: true },
    );
    if (ins.error) return;
    await db
      .from("email_funnel_assignments")
      .update({ exited_at: iso, exit_reason: args.reason, updated_at: iso })
      .eq("email", email)
      .eq("funnel", args.funnel)
      .is("exited_at", null);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// DB: next event (best effort, cached per process)
// ---------------------------------------------------------------------------

let eventCache: { at: number; value: NextEventInfo | null } | null = null;
const EVENT_TTL_MS = 10 * 60 * 1000;

/** Next public scheduled event that has not started yet, or null. Same filter
 * as events.ts listUpcomingEvents plus starts_at > now. Cached 10 minutes so a
 * cron batch reads it once. Never throws. */
export async function loadNextEvent(db: SupabaseClient, now = Date.now()): Promise<NextEventInfo | null> {
  if (eventCache && now - eventCache.at < EVENT_TTL_MS) return eventCache.value;
  let value: NextEventInfo | null = null;
  try {
    const res = await db
      .from("events")
      .select("id,title,starts_at,timezone")
      .eq("status", "scheduled")
      .eq("is_private", false)
      .gt("starts_at", new Date(now).toISOString())
      .order("starts_at", { ascending: true })
      .limit(1);
    const row = !res.error && Array.isArray(res.data) ? (res.data[0] as Record<string, unknown> | undefined) : undefined;
    if (row && typeof row.id === "string" && typeof row.title === "string" && typeof row.starts_at === "string") {
      value = {
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        timezone: typeof row.timezone === "string" && row.timezone ? row.timezone : "America/Denver",
      };
    }
  } catch {
    value = null;
  }
  eventCache = { at: now, value };
  return value;
}

/** Test hook. */
export function clearNextEventCache(): void {
  eventCache = null;
}
