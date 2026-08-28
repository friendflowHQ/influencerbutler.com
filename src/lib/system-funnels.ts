// Structural registry for the 5 built-in email funnels: display metadata,
// ordered steps (tier, label, default timing, email_sends category), the
// {{variables}} available to each funnel's copy, and a defaults renderer that
// produces the code-default subject/body for any step (used for previews and
// as the fallback the send path resolves against). Timing offsets mirror the
// cron TIERS arrays; categories mirror each funnel's `category:` string.

import { TRIAL_COPY, type TrialTier } from "@/lib/trial-emails";
import { PRO_COPY, type ProTier } from "@/lib/pro-emails";
import { ONBOARDING_COPY, type OnboardingTier } from "@/lib/free-onboarding-emails";
import { WINBACK_COPY, type WinbackSegment, type WinbackTier } from "@/lib/winback-emails";
import { conversionSubject, buildConversionBody, type ConversionTier } from "@/lib/conversion-emails";

export type FunnelStepMeta = {
  tier: string; // key into overrides; winback uses "comp_t1".."discount_t3"
  label: string;
  defaultDayOffset: number;
  category: string; // email_sends category for stats join
};

export type SystemFunnelMeta = {
  key: string; // trial | pro | conversion | onboarding | winback
  name: string;
  description: string;
  /** Info-tooltip text: who enters this funnel and when it fires. */
  tooltip: string;
  /** {{placeholder}} names available in this funnel's copy (editor chips). */
  vars: string[];
  steps: FunnelStepMeta[];
};

export const SYSTEM_FUNNELS: SystemFunnelMeta[] = [
  {
    key: "trial",
    name: "Trial drip",
    description: "Sends over a new user's 14-day Pro trial, from start to the final-hours push.",
    tooltip:
      "Enters automatically when a user starts the 14-day Pro trial. 6 emails from day 0 through the final hours on day 14.",
    vars: ["firstName", "monthlyCode", "annualCode", "monthlyPercent", "annualPercent", "subscriptionUrl"],
    steps: [
      { tier: "day0", label: "Day 0 (welcome)", defaultDayOffset: 0, category: "trial_day0" },
      { tier: "day1", label: "Day 1", defaultDayOffset: 1, category: "trial_day1" },
      { tier: "day3", label: "Day 3", defaultDayOffset: 3, category: "trial_day3" },
      { tier: "day7", label: "Day 7", defaultDayOffset: 7, category: "trial_day7" },
      { tier: "day13", label: "Day 13 (24 hours left)", defaultDayOffset: 13, category: "trial_day13" },
      { tier: "day14", label: "Day 14 (ends tonight)", defaultDayOffset: 14, category: "trial_day14" },
    ],
  },
  {
    key: "pro",
    name: "Pro welcome",
    description: "Onboards a new paying Pro subscriber over their first 10 days.",
    tooltip:
      "Enters automatically when someone becomes a paying Pro subscriber directly (not via a trial conversion). 4 emails over 10 days.",
    vars: ["firstName", "planName", "subscriptionUrl"],
    steps: [
      { tier: "day0", label: "Day 0 (welcome)", defaultDayOffset: 0, category: "pro_day0" },
      { tier: "day2", label: "Day 2", defaultDayOffset: 2, category: "pro_day2" },
      { tier: "day5", label: "Day 5", defaultDayOffset: 5, category: "pro_day5" },
      { tier: "day10", label: "Day 10", defaultDayOffset: 10, category: "pro_day10" },
    ],
  },
  {
    key: "onboarding",
    name: "Free onboarding",
    description: "Guides someone who downloaded the free app over their first 10 days.",
    tooltip:
      "Enters automatically when someone downloads the free app (a contact with source 'download-app'). 4 emails over 10 days.",
    vars: ["firstName", "pricingUrl", "helpUrl", "extensionUrl", "discountCode", "discountPercent"],
    steps: [
      { tier: "day0", label: "Day 0 (setup guide)", defaultDayOffset: 0, category: "onboarding_day0" },
      { tier: "day2", label: "Day 2", defaultDayOffset: 2, category: "onboarding_day2" },
      { tier: "day5", label: "Day 5", defaultDayOffset: 5, category: "onboarding_day5" },
      { tier: "day10", label: "Day 10", defaultDayOffset: 10, category: "onboarding_day10" },
    ],
  },
  {
    key: "winback",
    name: "Win-back",
    description:
      "Re-engages churned customers. The comp track offers free months; the discount track offers a code (for 'too expensive' cancels). Stats are shared per tier.",
    tooltip:
      "Enters automatically when a subscriber cancels. 'Too expensive' cancels get the discount track; everyone else gets the comp (free months) track. Emails on day 7, 21, and 45.",
    vars: ["firstName", "isTechnical", "claimUrl", "discountCode", "discountPercent", "checkoutUrl"],
    steps: [
      { tier: "comp_t1", label: "Comp: Day 7", defaultDayOffset: 7, category: "winback_t1" },
      { tier: "comp_t2", label: "Comp: Day 21", defaultDayOffset: 21, category: "winback_t2" },
      { tier: "comp_t3", label: "Comp: Day 45", defaultDayOffset: 45, category: "winback_t3" },
      { tier: "discount_t1", label: "Discount: Day 7", defaultDayOffset: 7, category: "winback_t1" },
      { tier: "discount_t2", label: "Discount: Day 21", defaultDayOffset: 21, category: "winback_t2" },
      { tier: "discount_t3", label: "Discount: Day 45", defaultDayOffset: 45, category: "winback_t3" },
    ],
  },
  {
    key: "conversion",
    name: "Affiliate conversion",
    description: "Nudges new affiliates to become paying customers with escalating offers.",
    tooltip:
      "Enters automatically when an affiliate application is approved and they have not purchased yet. 3 emails with escalating offers (1 hour, day 3, day 5).",
    vars: ["firstName", "code", "checkoutUrl"],
    steps: [
      { tier: "1h", label: "1 hour (20% off)", defaultDayOffset: 0, category: "conversion_1h" },
      { tier: "3d", label: "Day 3 (30% off)", defaultDayOffset: 3, category: "conversion_3d" },
      { tier: "5d", label: "Day 5 (50% off)", defaultDayOffset: 5, category: "conversion_5d" },
    ],
  },
];

/** Placeholder variable values for rendering previews and the send-time
 * fallback. Real sends pass real values; these are only for the admin view. */
export function previewVars(funnel: string): Record<string, unknown> {
  const site = "https://www.influencerbutler.com";
  switch (funnel) {
    case "trial":
      return {
        firstName: "Alex",
        monthlyCode: "SAVE20",
        annualCode: "ANNUAL20",
        monthlyPercent: 20,
        annualPercent: 20,
        subscriptionUrl: `${site}/pricing`,
      };
    case "pro":
      return { firstName: "Alex", planName: "Influencer Butler Pro", subscriptionUrl: `${site}/pricing` };
    case "onboarding":
      return {
        firstName: "Alex",
        pricingUrl: `${site}/pricing`,
        helpUrl: `${site}/help`,
        extensionUrl: `${site}/extension`,
        discountCode: "SAVE20",
        discountPercent: 20,
      };
    case "winback":
      return {
        firstName: "Alex",
        isTechnical: false,
        claimUrl: `${site}/api/winback/claim`,
        discountCode: "COMEBACK30",
        discountPercent: 30,
        checkoutUrl: `${site}/pricing`,
      };
    case "conversion":
      return { firstName: "Alex", code: "SAVE20", checkoutUrl: `${site}/pricing?code=SAVE20` };
    default:
      return { firstName: "Alex" };
  }
}

/** Renders the code-default subject/body for a step (no override applied).
 * Never throws; returns empty strings if the funnel/tier is unknown. */
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
      case "winback": {
        const [segment, wt] = tier.split("_");
        const seg = WINBACK_COPY[segment as WinbackSegment];
        const c = seg?.[wt as WinbackTier];
        if (!c) break;
        return { subject: renderSubject(c.subject, vars), body: c.build(vars as never) };
      }
      case "conversion": {
        const ct = tier as ConversionTier;
        const firstName = String(vars.firstName ?? "there");
        const code = String(vars.code ?? "");
        const checkoutUrl = String(vars.checkoutUrl ?? "");
        return { subject: conversionSubject(ct), body: buildConversionBody(ct, firstName, code, checkoutUrl) };
      }
    }
  } catch {
    // unknown funnel/tier or a copy fn that dislikes placeholder vars
  }
  return { subject: "", body: "" };
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

/** True when (funnel, tier) is a real step, so the API can reject junk. */
export function isValidStep(funnel: string, tier: string): boolean {
  return SYSTEM_FUNNELS.some((f) => f.key === funnel && f.steps.some((s) => s.tier === tier));
}
