/**
 * "Switch to annual by Nov 30" offer for paying MONTHLY subscribers (owner
 * rule 2026-11-11: the plan someone is on keeps its price, a new plan chosen
 * after Nov 30, including monthly to annual, is at the new price).
 *
 * Built from the variant the subscriber is actually on, so a Pro Trio or a
 * Beginner Solo customer sees their own numbers.
 */
import { planForVariantId, planMetaForVariantId, postDeadlinePlanFor, variantFamilyOf } from "@/lib/lemonsqueezy";
import { LEVEL_NAME, TIER_NAME, parseLevelPlan, planMetaFor, tierForPlan } from "@/lib/pricing-constants";

export type AnnualOffer = {
  planName: string;
  monthlyCents: number;
  /** Annual price if they switch by the deadline. */
  annualCents: number;
  /** 12 x monthly minus annual. */
  saveCents: number;
  /** Annual price if they switch after the deadline. */
  afterCents: number;
};

const TIER_WORD: Record<string, string> = { solo: "Solo", duo: "Trio", team: "Team", agency: "Agency" };

export function planDisplayName(plan: string): string {
  const level = parseLevelPlan(plan);
  if (level) return `${LEVEL_NAME[level.level]} ${TIER_WORD[level.tier]}`;
  const tier = tierForPlan(plan);
  return tier ? TIER_NAME[tier] : "your plan";
}

export function annualOfferFor(variantId: string | number | null | undefined): AnnualOffer | null {
  const plan = planForVariantId(variantId);
  if (!plan || !plan.endsWith("-monthly")) return null;
  const monthly = planMetaForVariantId(variantId);
  const annualPlan = plan.replace(/-monthly$/, "-annual");
  const today = planMetaFor(annualPlan, variantFamilyOf(variantId) ?? "current");
  const after = planMetaFor(postDeadlinePlanFor(annualPlan), "next");
  if (!monthly || !today || !after) return null;
  return {
    planName: planDisplayName(plan),
    monthlyCents: monthly.priceCents,
    annualCents: today.priceCents,
    saveCents: monthly.priceCents * 12 - today.priceCents,
    afterCents: after.priceCents,
  };
}

export const dollars = (cents: number) =>
  `$${cents % 100 === 0 ? (cents / 100).toLocaleString("en-US") : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The per-person lines for the Nov 24 email ({{ANNUAL_OFFER}}). */
export function annualOfferLines(o: AnnualOffer): string {
  return [
    `✨ You're on ${o.planName} at ${dollars(o.monthlyCents)} a month, and that stays locked`,
    `✨ Annual today: **${dollars(o.annualCents)} a year**, that's ${dollars(o.saveCents)} less than 12 months at ${dollars(o.monthlyCents)}`,
    `✨ Switch after Nov 30 and annual is ${dollars(o.afterCents)} a year`,
  ].join("\n");
}
