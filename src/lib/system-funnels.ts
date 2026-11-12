// Structural registry for the 7 built-in email funnels (trial, pro, onboarding,
// apptrial, winback, conversion, upgrade): display metadata, ordered steps
// (tier, label, default timing, email_sends category, Funnels v2 slot and
// content keys), the {{variables}} available to each funnel's copy, and a
// defaults renderer that produces the code-default subject/body for any step
// (used for previews and as the fallback the send path resolves against).
// Timing offsets mirror the cron TIERS arrays; categories mirror each funnel's
// `category:` string.
//
// Funnels v2: a step's content can vary by base track and module through
// content keys ("day5.beginner", "day5.mod-walmart"). Tailored code copy lives
// in funnel-track-registry.ts (copy files register at import time);
// funnelDefaultsForKey() walks it and falls back to the bare-tier copy below.

import { TRIAL_COPY, type TrialTier } from "@/lib/trial-emails";
import { PRO_COPY, type ProTier } from "@/lib/pro-emails";
import { ONBOARDING_COPY, type OnboardingTier } from "@/lib/free-onboarding-emails";
import { APP_TRIAL_COPY, type AppTrialTier } from "@/lib/app-trial-emails";
import { WINBACK_COPY, type WinbackSegment, type WinbackTier } from "@/lib/winback-emails";
import { conversionSubject, buildConversionBody, type ConversionTier } from "@/lib/conversion-emails";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE, priceChangeActive } from "@/lib/pricing-constants";
import {
  MODULE_KEYS,
  MODULE_KEY_PREFIX,
  contentKeyFallbacks,
  contentKeyTier,
  isAnyModuleKey,
  isPlanBase,
  parseContentKey,
  type FunnelSlot,
  type PlanBase,
} from "@/lib/funnel-types";
import { lookupTrackCopy, type TrackCopyEntry } from "@/lib/funnel-track-registry";
// Side-effect import: registers the upgrade funnel copy (u1/u2) so admin
// previews and code defaults find it. Nothing here imports system-funnels back.
import "@/lib/upgrade-emails";

export type FunnelStepMeta = {
  tier: string; // key into overrides; winback uses "comp_t1".."discount_t3"
  label: string;
  defaultDayOffset: number;
  category: string; // email_sends category for stats join
  /** Funnels v2 slot. base = varies by track; module = filled by the person's
   * Nth module (falls back to base); urgency = deadline step, cadence-exempt. */
  slot: FunnelSlot;
  /** For slot "module": which ranked module fills it (0 = A, 1 = B, 2 = C). */
  moduleIndex?: 0 | 1 | 2;
  /** Content keys the admin editor shows as tabs, bare tier first. Every key
   * is valid for isValidContentKey; other grammatical keys (e.g. a
   * module x base combo) are valid too but not listed. */
  contentKeys: string[];
};

export type SystemFunnelMeta = {
  key: string; // trial | pro | conversion | onboarding | winback | apptrial | upgrade
  name: string;
  description: string;
  /** Info-tooltip text: who enters this funnel and when it fires. */
  tooltip: string;
  /** {{placeholder}} names available in this funnel's copy (editor chips). */
  vars: string[];
  steps: FunnelStepMeta[];
};

const ALL_BASES: PlanBase[] = ["beginner", "power", "unknown", "starter"];
const PLAN_BASES_BP: PlanBase[] = ["beginner", "power"];

/** Bare tier plus one key per base. */
function baseKeys(tier: string, bases: PlanBase[] = []): string[] {
  return [tier, ...bases.map((b) => `${tier}.${b}`)];
}

/** Bare tier plus one key per v1 module. */
function moduleKeys(tier: string): string[] {
  return [tier, ...MODULE_KEYS.map((m) => `${tier}.${MODULE_KEY_PREFIX}${m}`)];
}

/** Per-track variables (filled by funnel-personalize buildTrackVars). */
const TRACK_VARS = ["aiLine", "priceLockLine", "price", "beginnerPrice", "eventLine", "goalLine", "bookCallUrl"];

export const SYSTEM_FUNNELS: SystemFunnelMeta[] = [
  {
    key: "trial",
    name: "Trial drip",
    description: "Sends over a new user's 14-day Pro trial, from start to the final-hours push.",
    tooltip:
      "Enters automatically when a user starts the 14-day Pro trial. 7 emails from day 0 through the final hours on day 14.",
    vars: ["firstName", "monthlyCode", "annualCode", "monthlyPercent", "annualPercent", "subscriptionUrl", ...TRACK_VARS],
    steps: [
      { tier: "day0", label: "Day 0 (welcome)", defaultDayOffset: 0, category: "trial_day0", slot: "base", contentKeys: baseKeys("day0", PLAN_BASES_BP) },
      { tier: "day1", label: "Day 1", defaultDayOffset: 1, category: "trial_day1", slot: "module", moduleIndex: 0, contentKeys: moduleKeys("day1") },
      { tier: "day3", label: "Day 3", defaultDayOffset: 3, category: "trial_day3", slot: "base", contentKeys: baseKeys("day3") },
      { tier: "day7", label: "Day 7", defaultDayOffset: 7, category: "trial_day7", slot: "module", moduleIndex: 1, contentKeys: moduleKeys("day7") },
      { tier: "day11", label: "Day 11 (3 days left)", defaultDayOffset: 11, category: "trial_day11", slot: "base", contentKeys: baseKeys("day11") },
      { tier: "day13", label: "Day 13 (24 hours left)", defaultDayOffset: 13, category: "trial_day13", slot: "urgency", contentKeys: baseKeys("day13") },
      { tier: "day14", label: "Day 14 (ends tonight)", defaultDayOffset: 14, category: "trial_day14", slot: "urgency", contentKeys: baseKeys("day14") },
    ],
  },
  {
    key: "pro",
    name: "Pro welcome",
    description: "Onboards a new paying Pro subscriber over their first 10 days.",
    tooltip:
      "Enters automatically when someone becomes a paying Pro subscriber directly (not via a trial conversion). 4 emails over 10 days.",
    vars: ["firstName", "planName", "subscriptionUrl", ...TRACK_VARS],
    steps: [
      { tier: "day0", label: "Day 0 (welcome)", defaultDayOffset: 0, category: "pro_day0", slot: "base", contentKeys: baseKeys("day0", PLAN_BASES_BP) },
      { tier: "day2", label: "Day 2", defaultDayOffset: 2, category: "pro_day2", slot: "base", contentKeys: baseKeys("day2", PLAN_BASES_BP) },
      { tier: "day5", label: "Day 5", defaultDayOffset: 5, category: "pro_day5", slot: "module", moduleIndex: 0, contentKeys: moduleKeys("day5") },
      { tier: "day10", label: "Day 10", defaultDayOffset: 10, category: "pro_day10", slot: "base", contentKeys: baseKeys("day10") },
    ],
  },
  {
    key: "onboarding",
    name: "Free onboarding",
    description: "Guides someone who downloaded the free app over their first 10 days.",
    tooltip:
      "Enters automatically when someone downloads the free app (a contact with source 'download-app'). 4 emails over 10 days.",
    vars: ["firstName", "pricingUrl", "helpUrl", "extensionUrl", "discountCode", "discountPercent", ...TRACK_VARS],
    steps: [
      { tier: "day0", label: "Day 0 (setup guide)", defaultDayOffset: 0, category: "onboarding_day0", slot: "base", contentKeys: baseKeys("day0") },
      { tier: "day2", label: "Day 2", defaultDayOffset: 2, category: "onboarding_day2", slot: "module", moduleIndex: 0, contentKeys: moduleKeys("day2") },
      { tier: "day5", label: "Day 5", defaultDayOffset: 5, category: "onboarding_day5", slot: "module", moduleIndex: 1, contentKeys: moduleKeys("day5") },
      { tier: "day10", label: "Day 10", defaultDayOffset: 10, category: "onboarding_day10", slot: "base", contentKeys: baseKeys("day10") },
    ],
  },
  {
    key: "apptrial",
    name: "App trial",
    description:
      "Runs over the 14-day desktop app trial, then a short lapsed tail. This is the no-card trial started inside the app, not the Lemon Squeezy checkout trial.",
    tooltip:
      "Enters automatically when someone installs the desktop app and enters their email in the startup walkthrough. 8 emails across the trial, then 3 more if they do not continue.",
    vars: ["firstName", "pricingUrl", "helpUrl", "discountCode", "discountPercent", ...TRACK_VARS],
    steps: [
      { tier: "day0", label: "Day 0 (welcome)", defaultDayOffset: 0, category: "apptrial_day0", slot: "base", contentKeys: baseKeys("day0", ALL_BASES) },
      { tier: "day1", label: "Day 1", defaultDayOffset: 1, category: "apptrial_day1", slot: "base", contentKeys: baseKeys("day1", PLAN_BASES_BP) },
      { tier: "day3", label: "Day 3", defaultDayOffset: 3, category: "apptrial_day3", slot: "module", moduleIndex: 0, contentKeys: moduleKeys("day3") },
      { tier: "day5", label: "Day 5", defaultDayOffset: 5, category: "apptrial_day5", slot: "module", moduleIndex: 1, contentKeys: moduleKeys("day5") },
      { tier: "day7", label: "Day 7 (halfway)", defaultDayOffset: 7, category: "apptrial_day7", slot: "base", contentKeys: baseKeys("day7") },
      { tier: "day10", label: "Day 10", defaultDayOffset: 10, category: "apptrial_day10", slot: "module", moduleIndex: 2, contentKeys: moduleKeys("day10") },
      { tier: "day12", label: "Day 12 (2 days left)", defaultDayOffset: 12, category: "apptrial_day12", slot: "base", contentKeys: baseKeys("day12") },
      { tier: "day14", label: "Day 14 (ends today)", defaultDayOffset: 14, category: "apptrial_day14", slot: "urgency", contentKeys: baseKeys("day14", PLAN_BASES_BP) },
      { tier: "day17", label: "Day 17 (lapsed)", defaultDayOffset: 17, category: "apptrial_day17", slot: "base", contentKeys: baseKeys("day17", PLAN_BASES_BP) },
      { tier: "day21", label: "Day 21 (lapsed)", defaultDayOffset: 21, category: "apptrial_day21", slot: "base", contentKeys: baseKeys("day21") },
      { tier: "day30", label: "Day 30 (last touch)", defaultDayOffset: 30, category: "apptrial_day30", slot: "base", contentKeys: baseKeys("day30") },
    ],
  },
  {
    key: "winback",
    name: "Win-back",
    description:
      "Re-engages churned customers. The comp track offers free months; the discount track offers a code (for 'too expensive' cancels). Stats are shared per tier.",
    tooltip:
      "Enters automatically when a subscriber cancels. 'Too expensive' cancels get the discount track; everyone else gets the comp (free months) track. Emails on day 7, 21, and 45.",
    vars: ["firstName", "isTechnical", "claimUrl", "discountCode", "discountPercent", "checkoutUrl", ...TRACK_VARS],
    steps: [
      { tier: "comp_t1", label: "Comp: Day 7", defaultDayOffset: 7, category: "winback_t1", slot: "base", contentKeys: baseKeys("comp_t1") },
      { tier: "comp_t2", label: "Comp: Day 21", defaultDayOffset: 21, category: "winback_t2", slot: "base", contentKeys: baseKeys("comp_t2") },
      { tier: "comp_t3", label: "Comp: Day 45", defaultDayOffset: 45, category: "winback_t3", slot: "base", contentKeys: baseKeys("comp_t3") },
      { tier: "discount_t1", label: "Discount: Day 7", defaultDayOffset: 7, category: "winback_t1", slot: "base", contentKeys: baseKeys("discount_t1") },
      { tier: "discount_t2", label: "Discount: Day 21", defaultDayOffset: 21, category: "winback_t2", slot: "base", contentKeys: baseKeys("discount_t2") },
      { tier: "discount_t3", label: "Discount: Day 45", defaultDayOffset: 45, category: "winback_t3", slot: "base", contentKeys: baseKeys("discount_t3") },
    ],
  },
  {
    key: "conversion",
    name: "Affiliate conversion",
    description: "Nudges new affiliates to become paying customers with escalating offers.",
    tooltip:
      "Enters automatically when an affiliate application is approved and they have not purchased yet. 3 emails with escalating offers (1 hour, day 3, day 5).",
    vars: ["firstName", "code", "checkoutUrl", ...TRACK_VARS],
    steps: [
      { tier: "1h", label: "1 hour (20% off)", defaultDayOffset: 0, category: "conversion_1h", slot: "base", contentKeys: baseKeys("1h") },
      { tier: "3d", label: "Day 3 (30% off)", defaultDayOffset: 3, category: "conversion_3d", slot: "base", contentKeys: baseKeys("3d") },
      { tier: "5d", label: "Day 5 (50% off)", defaultDayOffset: 5, category: "conversion_5d", slot: "urgency", contentKeys: baseKeys("5d") },
    ],
  },
  {
    key: "upgrade",
    name: "Beginner to Power User",
    description:
      "Shows paying Beginner subscribers what Power User adds. Progress lives in email_funnel_step_sends, not in per-tier columns.",
    tooltip:
      "Enters automatically for paying Beginner subscribers, counted from when their paid plan started. Exits when they move to Power User. 2 emails (day 21 and day 35).",
    vars: ["firstName", "upgradeUrl", "bookCallUrl", "toolsLine"],
    steps: [
      { tier: "u1", label: "Day 21 (tools you'd unlock)", defaultDayOffset: 21, category: "upgrade_u1", slot: "base", contentKeys: baseKeys("u1") },
      { tier: "u2", label: "Day 35 (Priority 1:1 call)", defaultDayOffset: 35, category: "upgrade_u2", slot: "base", contentKeys: baseKeys("u2") },
    ],
  },
];

/** "$24.99" / "$39" from cents. */
function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Sample values for the per-track variables (admin previews only; real sends
 * get them from funnel-personalize buildTrackVars). */
function sampleTrackVars(site: string): Record<string, unknown> {
  const power = LEVEL_PRICE_CENTS.power.solo?.monthly ?? 0;
  const beginner = LEVEL_PRICE_CENTS.beginner.solo?.monthly ?? 0;
  const priceLockLine = priceChangeActive()
    ? `Prices go up after ${PRICE_CHANGE.dayLabel}. Start before then and you keep today's price for as long as you stay subscribed.`
    : "";
  return {
    aiLine:
      "AI is included on Beginner (150 AI actions a month on our key). Power User runs unlimited AI on your own OpenAI key.",
    priceLockLine,
    price: `${dollars(power)}/month`,
    beginnerPrice: `${dollars(beginner)}/month`,
    eventLine: `Join our next live group call and bring your questions: ${site}/events`,
    goalLine:
      "You picked uploading your Amazon videos to other country marketplaces in the walkthrough: the app can re-post your US storefront videos to Canada, the UK, Australia and Singapore.",
    bookCallUrl: `${site}/dashboard/book`,
  };
}

/** Placeholder variable values for rendering previews and the send-time
 * fallback. Real sends pass real values; these are only for the admin view. */
export function previewVars(funnel: string): Record<string, unknown> {
  const site = "https://www.influencerbutler.com";
  const track = sampleTrackVars(site);
  switch (funnel) {
    case "trial":
      return {
        firstName: "Alex",
        monthlyCode: "SAVE20",
        annualCode: "ANNUAL20",
        monthlyPercent: 20,
        annualPercent: 20,
        subscriptionUrl: `${site}/pricing`,
        ...track,
      };
    case "pro":
      return { firstName: "Alex", planName: "Influencer Butler Pro", subscriptionUrl: `${site}/pricing`, ...track };
    case "onboarding":
      return {
        firstName: "Alex",
        pricingUrl: `${site}/pricing`,
        helpUrl: `${site}/help`,
        extensionUrl: `${site}/extension`,
        discountCode: "SAVE20",
        discountPercent: 20,
        ...track,
      };
    case "apptrial":
      return {
        firstName: "Alex",
        pricingUrl: `${site}/pricing`,
        helpUrl: `${site}/help`,
        discountCode: "SAVE20",
        discountPercent: 20,
        ...track,
      };
    case "winback":
      return {
        firstName: "Alex",
        isTechnical: false,
        claimUrl: `${site}/api/winback/claim`,
        discountCode: "COMEBACK30",
        discountPercent: 30,
        checkoutUrl: `${site}/pricing`,
        ...track,
      };
    case "conversion":
      return { firstName: "Alex", code: "SAVE20", checkoutUrl: `${site}/pricing?code=SAVE20`, ...track };
    case "upgrade":
      return {
        firstName: "Alex",
        upgradeUrl: `${site}/dashboard/subscription`,
        bookCallUrl: `${site}/dashboard/book`,
        toolsLine: "Walmart Butler, Social Posting and the YouTube butlers",
      };
    default:
      return { firstName: "Alex" };
  }
}

function renderEntry(entry: TrackCopyEntry, vars: Record<string, unknown>): { subject: string; body: string } {
  return { subject: renderSubject(entry.subject, vars), body: String(entry.build(vars)) };
}

/** Renders the code-default subject/body for a step (no override applied).
 * Never throws; returns empty strings if the funnel/tier is unknown. A tier
 * with no hard-coded copy falls back to bare-key copy in the track registry
 * (how the upgrade funnel supplies its copy). */
export function funnelDefaults(
  funnel: string,
  tier: string,
  vars: Record<string, unknown>,
): { subject: string; body: string } {
  try {
    switch (funnel) {
      case "trial": {
        const c = TRIAL_COPY[tier as TrialTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }
      case "pro": {
        const c = PRO_COPY[tier as ProTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }
      case "onboarding": {
        const c = ONBOARDING_COPY[tier as OnboardingTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }

      case "apptrial": {
        const c = APP_TRIAL_COPY[tier as AppTrialTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }
      case "winback": {
        const [segment, wt] = tier.split("_");
        const seg = WINBACK_COPY[segment as WinbackSegment];
        const c = seg?.[wt as WinbackTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }
      case "conversion": {
        const ct = tier as ConversionTier;
        if (ct !== "1h" && ct !== "3d" && ct !== "5d") break;
        const firstName = String(vars.firstName ?? "there");
        const code = String(vars.code ?? "");
        const checkoutUrl = String(vars.checkoutUrl ?? "");
        return { subject: conversionSubject(ct), body: buildConversionBody(ct, firstName, code, checkoutUrl, vars as never) };
      }
    }
  } catch {
    // unknown funnel/tier or a copy fn that dislikes placeholder vars
  }
  try {
    const reg = lookupTrackCopy(funnel, tier);
    if (reg) return renderEntry(reg, vars);
  } catch {
    // registered copy fn threw on placeholder vars
  }
  return { subject: "", body: "" };
}

/** Code copy registered for EXACTLY this content key (no fallback walk), or
 * for a bare key the bare-tier code default. null when nothing exists (an
 * empty bare default also returns null). Never throws. */
export function codeDefaultForExactKey(
  funnel: string,
  key: string,
  vars: Record<string, unknown>,
): { subject: string; body: string } | null {
  const p = parseContentKey(key);
  if (!p) return null;
  if (!p.base && !p.module) {
    const d = funnelDefaults(funnel, p.tier, vars);
    return d.subject || d.body ? d : null;
  }
  try {
    const entry = lookupTrackCopy(funnel, key);
    return entry ? renderEntry(entry, vars) : null;
  } catch {
    return null;
  }
}

/** Binds codeDefaultForExactKey to a funnel + vars: the `codeDefaultForKey`
 * callback resolveFunnelCopyForKey (funnel-copy.ts) expects. */
export function makeCodeDefaultForKey(
  funnel: string,
  vars: Record<string, unknown>,
): (key: string) => { subject: string; body: string } | null {
  return (key) => codeDefaultForExactKey(funnel, key, vars);
}

/** Code-default copy for a content key, walking contentKeyFallbacks(): the
 * most specific registered track/module copy, else the bare-tier default.
 * `sourceKey` says which key supplied it ("" when nothing did). Bare tiers
 * behave exactly like funnelDefaults(). Never throws. */
export function funnelDefaultsForKey(
  funnel: string,
  key: string,
  vars: Record<string, unknown>,
): { subject: string; body: string; sourceKey: string } {
  for (const k of contentKeyFallbacks(key)) {
    const d = codeDefaultForExactKey(funnel, k, vars);
    if (d) return { ...d, sourceKey: k };
  }
  const tier = contentKeyTier(key);
  const d = funnelDefaults(funnel, tier, vars);
  return { ...d, sourceKey: d.subject || d.body ? tier : "" };
}

/** Renders a subject that may be a plain string or a (vars) => string function,
 * without tripping over per-funnel type differences (Pro's is string-only). */
function renderSubject(subj: unknown, vars: Record<string, unknown>): string {
  if (typeof subj === "function") return String((subj as (v: unknown) => string)(vars));
  return String(subj ?? "");
}

export function findFunnel(key: string): SystemFunnelMeta | undefined {
  return SYSTEM_FUNNELS.find((f) => f.key === key);
}

export function findStep(funnel: string, tier: string): FunnelStepMeta | undefined {
  return findFunnel(funnel)?.steps.find((s) => s.tier === tier);
}

/** True when (funnel, tier) is a real step, so the API can reject junk. Bare
 * tiers only; use isValidContentKey for tailored keys. */
export function isValidStep(funnel: string, tier: string): boolean {
  return SYSTEM_FUNNELS.some((f) => f.key === funnel && f.steps.some((s) => s.tier === tier));
}

/** True when `key` parses, its tier is a real step of `funnel`, and a module
 * part only appears on a module slot. Bare tiers are always valid. */
export function isValidContentKey(funnel: string, key: string): boolean {
  const p = parseContentKey(key);
  if (!p) return false;
  const step = findStep(funnel, p.tier);
  if (!step) return false;
  if (p.base && !isPlanBase(p.base)) return false;
  if (p.module) {
    if (!isAnyModuleKey(p.module)) return false;
    if (step.slot !== "module") return false;
  }
  return true;
}
