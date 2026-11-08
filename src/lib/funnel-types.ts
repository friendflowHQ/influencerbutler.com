// Funnels v2: shared types, vocabulary and content-key helpers.
//
// Every Funnels v2 module (onboarding profile intake, plan level, activation,
// personalization, cadence, copy registries, metrics, experiments, admin UI)
// imports its shared names from here. Keep this file DEPENDENCY-FREE (no
// imports) so it can be pulled into copy files, crons and client components
// without creating import cycles.

// ---------------------------------------------------------------------------
// Plan level and base track
// ---------------------------------------------------------------------------

/** The base copy track a person gets inside a funnel. `starter` overrides the
 * plan base for brand-new creators (wt-exp-brand-new or wt-goal-beginner-start). */
export type PlanBase = "beginner" | "power" | "unknown" | "starter";
export const PLAN_BASES: readonly PlanBase[] = ["beginner", "power", "unknown", "starter"];

/** Stored plan level on email_subscribers.plan_level. `legacy` = a pre-split
 * plan, which reads as `power` for copy. */
export type PlanLevelValue = "beginner" | "power" | "legacy";
export const PLAN_LEVEL_VALUES: readonly PlanLevelValue[] = ["beginner", "power", "legacy"];

/** Where plan_level came from, highest rank first: Lemon Squeezy variant,
 * comp grant, desktop planLevelIntent, inferred. */
export type PlanLevelSource = "ls" | "comp" | "intent" | "inferred";
export const PLAN_LEVEL_SOURCE_RANK: readonly PlanLevelSource[] = ["ls", "comp", "intent", "inferred"];

/** Copy base for a stored plan level (legacy reads as power; null = unknown). */
export function planBaseForLevel(level: PlanLevelValue | null | undefined): PlanBase {
  if (level === "beginner") return "beginner";
  if (level === "power" || level === "legacy") return "power";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/** Modules with v1 copy. A person gets up to 3, ranked, per funnel. */
export type ModuleKey = "cc-auto" | "walmart" | "deals" | "social" | "video" | "amazon-offsite";
export const MODULE_KEYS: readonly ModuleKey[] = [
  "cc-auto",
  "walmart",
  "deals",
  "social",
  "video",
  "amazon-offsite",
];

/** Every module the content-key grammar accepts, including future ones with
 * no v1 copy. A key naming a future module resolves to the base copy. */
export type AnyModuleKey =
  | ModuleKey
  | "amazon-onsite"
  | "photo"
  | "benable"
  | "youtube"
  | "starter-offsite"
  | "starter-onsite";
export const ALL_MODULE_KEYS: readonly AnyModuleKey[] = [
  ...MODULE_KEYS,
  "amazon-onsite",
  "photo",
  "benable",
  "youtube",
  "starter-offsite",
  "starter-onsite",
];

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (MODULE_KEYS as readonly string[]).includes(v);
}
export function isAnyModuleKey(v: unknown): v is AnyModuleKey {
  return typeof v === "string" && (ALL_MODULE_KEYS as readonly string[]).includes(v);
}
export function isPlanBase(v: unknown): v is PlanBase {
  return typeof v === "string" && (PLAN_BASES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Onboarding profile (desktop walkthrough answers)
// ---------------------------------------------------------------------------

export const ONBOARDING_PROFILE_VERSION = 1;

/** Exact values the desktop walkthrough persists (hud.onboarding.*.v1). Any
 * value outside these lists is dropped by the parser. */
export const ONBOARDING_VOCAB = {
  experience: ["brand-new", "existing"],
  aipPath: ["associates-first", "influencer-first", "both"],
  creatorMode: ["onsite", "offsite", "both"],
  goal: ["video-marketplaces", "photo-marketplaces", "cc-auto-accept", "beginner-start", "everything"],
  platforms: ["amazon", "walmart", "instagram", "youtube", "deals-influencer", "facebook", "benable"],
  mode: ["automation", "manual"],
  dealsPostingMode: ["manual", "auto"],
  outcome: ["complete", "complete-with-skips", "paused", "skipped"],
  marketplaces: [
    "us", "ca", "uk", "de", "au", "sg", "br", "mx", "ie", "fr", "it",
    "es", "nl", "be", "se", "pl", "tr", "ae", "sa", "eg", "jp", "in",
  ],
} as const;

export type OnboardingExperience = (typeof ONBOARDING_VOCAB.experience)[number];
export type OnboardingAipPath = (typeof ONBOARDING_VOCAB.aipPath)[number];
export type OnboardingCreatorMode = (typeof ONBOARDING_VOCAB.creatorMode)[number];
export type OnboardingGoal = (typeof ONBOARDING_VOCAB.goal)[number];
export type OnboardingPlatform = (typeof ONBOARDING_VOCAB.platforms)[number];
export type OnboardingMode = (typeof ONBOARDING_VOCAB.mode)[number];
export type OnboardingDealsPostingMode = (typeof ONBOARDING_VOCAB.dealsPostingMode)[number];
export type OnboardingOutcome = (typeof ONBOARDING_VOCAB.outcome)[number];
export type OnboardingMarketplace = (typeof ONBOARDING_VOCAB.marketplaces)[number];

/** capture = email entered mid-walkthrough; complete = a finish path ran;
 * backfill = one-time resend for people who finished before v2. */
export type OnboardingProfileStage = "capture" | "complete" | "backfill";
export const ONBOARDING_PROFILE_STAGES: readonly OnboardingProfileStage[] = ["capture", "complete", "backfill"];

/** Stored as email_subscribers.onboarding_profile (jsonb). */
export interface OnboardingProfile {
  v: number;
  stage: OnboardingProfileStage;
  experience?: OnboardingExperience;
  aipPath?: OnboardingAipPath;
  creatorMode?: OnboardingCreatorMode;
  goal?: OnboardingGoal;
  platforms?: OnboardingPlatform[];
  mode?: OnboardingMode;
  marketplaces?: OnboardingMarketplace[];
  dealsPostingMode?: OnboardingDealsPostingMode;
  outcome?: OnboardingOutcome;
}

// ---------------------------------------------------------------------------
// Managed tags
// ---------------------------------------------------------------------------

/** Tags with these prefixes are owned by Funnels v2: replaced wholesale on each
 * profile / plan update and never fire enrollForTagAdded. */
export const MANAGED_TAG_PREFIXES = ["wt-", "plan-"] as const;

/** Tag prefix per profile field. A tag is `${prefix}${value}`. */
export const WT_TAG_PREFIX = {
  experience: "wt-exp-",
  aipPath: "wt-path-",
  creatorMode: "wt-mode-",
  goal: "wt-goal-",
  platforms: "wt-plat-",
  mode: "wt-run-",
  dealsPostingMode: "wt-deals-",
  outcome: "wt-done-",
} as const;

/** Set when the profile lists any marketplace other than "us". Individual
 * marketplace codes are not tagged in v1. */
export const WT_MKT_INTL_TAG = "wt-mkt-intl";

export const PLAN_TAG_PREFIX = "plan-";
export const PLAN_TAGS: Record<PlanLevelValue, string> = {
  beginner: "plan-beginner",
  power: "plan-power",
  legacy: "plan-legacy",
};

/** Every tag Funnels v2 can write, in a stable order (tests + admin warnings). */
export const ALL_MANAGED_TAGS: readonly string[] = (() => {
  const out: string[] = [];
  const fields = Object.keys(WT_TAG_PREFIX) as (keyof typeof WT_TAG_PREFIX)[];
  for (const f of fields) {
    for (const v of ONBOARDING_VOCAB[f]) out.push(`${WT_TAG_PREFIX[f]}${v}`);
  }
  out.push(WT_MKT_INTL_TAG);
  for (const l of PLAN_LEVEL_VALUES) out.push(PLAN_TAGS[l]);
  return out;
})();

export function isManagedTag(tag: string): boolean {
  return MANAGED_TAG_PREFIXES.some((p) => tag.startsWith(p));
}

// ---------------------------------------------------------------------------
// Funnels, assignments, slots
// ---------------------------------------------------------------------------

export type FunnelKey = "trial" | "pro" | "onboarding" | "apptrial" | "winback" | "conversion" | "upgrade";

/** base = varies by base track; module = filled by the person's Nth ranked
 * module (falls back to base); urgency = deadline step, exempt from the
 * cadence cap. */
export type FunnelSlot = "base" | "module" | "urgency";

export type FunnelExitReason = "superseded" | "converted" | "unsubscribed" | "plan-changed" | "manual";

/** A row of email_funnel_assignments (camelCased). */
export interface FunnelAssignment {
  email: string;
  funnel: string;
  track: PlanBase;
  modules: ModuleKey[];
  lockedAt: string | null;
  exitedAt: string | null;
  exitReason: string | null;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export type ActivationSignal =
  | "first-butler-run"
  | "extension-paired"
  | "walkthrough-auto-complete"
  | "desktop-action"
  | "earnings-sync"
  | "extension-install"
  | "license-validate";

/** strong signals set activated_at; weak ones only set engaged_at. */
export const ACTIVATION_SIGNAL_STRENGTH: Record<ActivationSignal, "strong" | "weak"> = {
  "first-butler-run": "strong",
  "extension-paired": "strong",
  "walkthrough-auto-complete": "strong",
  "desktop-action": "strong",
  "earnings-sync": "strong",
  "extension-install": "weak",
  "license-validate": "weak",
};
export const ACTIVATION_SIGNALS = Object.keys(ACTIVATION_SIGNAL_STRENGTH) as ActivationSignal[];

/** Activation counts when activated_at is within this many days of entry. */
export const ACTIVATION_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Content keys
// ---------------------------------------------------------------------------
//
// Grammar (dot separated, so it never collides with the "funnel:tier" map key):
//   key    := tier | tier "." base | tier ".mod-" module | tier ".mod-" module "." base
//   tier   := [a-z0-9_]+            e.g. day5, comp_t1, 1h, u1
//   base   := beginner | power | unknown | starter
//   module := one of ALL_MODULE_KEYS
// Examples: day5, day5.beginner, day5.mod-walmart, day5.mod-walmart.power

export const MODULE_KEY_PREFIX = "mod-";
const TIER_RE = /^[a-z0-9_]+$/;

export interface ParsedContentKey {
  tier: string;
  base?: PlanBase;
  module?: AnyModuleKey;
}

/** Builds a content key. Unknown base/module values are ignored. */
export function contentKey(tier: string, opts?: { base?: PlanBase | null; module?: AnyModuleKey | null }): string {
  let key = tier;
  if (opts?.module && isAnyModuleKey(opts.module)) key += `.${MODULE_KEY_PREFIX}${opts.module}`;
  if (opts?.base && isPlanBase(opts.base)) key += `.${opts.base}`;
  return key;
}

/** Parses a content key; null when it does not match the grammar. */
export function parseContentKey(key: string): ParsedContentKey | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const parts = key.split(".");
  const tier = parts[0];
  if (!TIER_RE.test(tier) || parts.length > 3) return null;
  const out: ParsedContentKey = { tier };
  let i = 1;
  if (i < parts.length && parts[i].startsWith(MODULE_KEY_PREFIX)) {
    const mod = parts[i].slice(MODULE_KEY_PREFIX.length);
    if (!isAnyModuleKey(mod)) return null;
    out.module = mod;
    i++;
  }
  if (i < parts.length) {
    if (!isPlanBase(parts[i])) return null;
    out.base = parts[i] as PlanBase;
    i++;
  }
  if (i !== parts.length) return null;
  return out;
}

/** The bare tier of a content key (the key itself when unparseable). */
export function contentKeyTier(key: string): string {
  return parseContentKey(key)?.tier ?? key;
}

/** True for a bare tier key ("day5"). */
export function isBareKey(key: string): boolean {
  const p = parseContentKey(key);
  return !!p && !p.base && !p.module;
}

/** Most specific first, ending with the bare tier. Copy resolution walks this:
 *   day5.mod-walmart.power -> day5.mod-walmart.power, day5.mod-walmart, day5.power, day5
 *   day5.mod-walmart       -> day5.mod-walmart, day5
 *   day5.beginner          -> day5.beginner, day5
 *   day5                   -> day5
 * An unparseable key returns [key]. */
export function contentKeyFallbacks(key: string): string[] {
  const p = parseContentKey(key);
  if (!p) return [key];
  const out: string[] = [];
  const push = (k: string) => {
    if (!out.includes(k)) out.push(k);
  };
  if (p.module && p.base) push(contentKey(p.tier, { module: p.module, base: p.base }));
  if (p.module) push(contentKey(p.tier, { module: p.module }));
  if (p.base) push(contentKey(p.tier, { base: p.base }));
  push(p.tier);
  return out;
}

// ---------------------------------------------------------------------------
// Rollout flags
// ---------------------------------------------------------------------------

const DEFAULT_FUNNELS_V2_START = "2026-11-09T00:00:00Z";

function readStart(): string {
  const raw = typeof process !== "undefined" ? process.env?.FUNNELS_V2_START : undefined;
  if (raw && !Number.isNaN(Date.parse(raw))) return raw;
  return DEFAULT_FUNNELS_V2_START;
}

/** ISO date Funnels v2 went live. Gates trial-converter entry into Pro welcome
 * (pro_started_at >= this) so past customers are never mailed. Env
 * FUNNELS_V2_START overrides; an unparseable value falls back to the default. */
export const FUNNELS_V2_START: string = readStart();

/** FUNNELS_V2_START as epoch ms, re-read from env on each call (tests). */
export function funnelsV2StartMs(): number {
  return Date.parse(readStart());
}

/** Env FUNNELS_V2 === "1" switches the send path to tailored content keys,
 * assignments and the cadence cap. Off = today's behavior exactly. */
export function funnelsV2Enabled(): boolean {
  return typeof process !== "undefined" && process.env?.FUNNELS_V2 === "1";
}
