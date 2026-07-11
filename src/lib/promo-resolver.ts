/**
 * Summary: Picks the best promo code for a checkout under the affiliate-XOR-welcome
 * stacking rule, and preserves first-touch affiliate attribution.
 * Dependencies: ./lemonsqueezy-discount-lookup, ./affiliate-lookup, ./promo.
 *
 * The math (see computeSavedCents) compares codes by the total dollar amount
 * the user would save across a 24-month horizon - so 20% off forever beats
 * 30% off once on an annual plan, but loses to 50% off the first year.
 *
 * Stacking rule (applyStackingRules): a customer may apply either an
 * Affiliate-tracked code (URL/typed) OR a site-wide welcome-cookie code,
 * not both. When any Affiliate candidate is present, welcome-cookie
 * candidates are dropped from the discount ranking before pickWinner runs -
 * so the affiliate's discount actually applies and they keep attribution.
 *
 * Attribution is decoupled from discount: a URL-sourced affiliate code that
 * loses the discount comparison against a typed affiliate code still wins
 * the LS aff_ref slot via first-touch priority, so the affiliate earns
 * their commission.
 */

import { fetchDiscountByCode, type LsDiscount } from "./lemonsqueezy-discount-lookup";
import {
  lookupAffiliateOwnerByCode,
  selfHostedAffiliatesEnabled,
  withTimeout,
} from "./affiliate-lookup";
import {
  WELCOME_FIRST_CODE,
  WELCOME_RETURNING_CODE,
  DISCOUNT_PCT_FIRST,
  DISCOUNT_PCT_RETURNING,
  type PromoTier,
} from "./promo";

export const COMPARISON_HORIZON_MONTHS = 24;
const AFFILIATE_LOOKUP_TIMEOUT_MS = 3_000;

export type PlanInterval = "month" | "year";
export type Plan = {
  /** Plan price in **cents**. */
  priceCents: number;
  interval: PlanInterval;
};

export type CandidateSource = "typed" | "welcome-cookie" | "url-code";

export type CandidateCode = {
  source: CandidateSource;
  /** Canonical code as it appears in LS (preserve case from LS for the checkout submission). */
  code: string;
  ls: LsDiscount;
  isAffiliate: boolean;
  lsAffiliateId: string | null;
  /**
   * Affiliate's Supabase user id (profiles.id) if this code belongs to an
   * affiliate, linked or not. Set even when `lsAffiliateId` is null, so the
   * intended affiliate can be captured during the pre-LS-activation gap.
   */
  affiliateUserId: string | null;
  /** Pre-computed in the resolver so tests + tie-break can read it. */
  savedCents: number;
};

export type RawCandidate = {
  source: CandidateSource;
  /** Raw user-supplied code; will be uppercased + trimmed during gathering. */
  code: string;
};

export type Attribution = {
  lsAffiliateId: string;
  sourceCode: string;
  source: CandidateSource;
};

/**
 * The affiliate a checkout should be credited to, resolved by first-touch
 * regardless of LS activation state. When `hasLsId` is true the live `aff_ref`
 * path already credits LS; when false this is a pre-activation referral that
 * must be captured on the order and reconciled once the affiliate goes live.
 */
export type IntendedAffiliate = {
  affiliateUserId: string;
  sourceCode: string;
  source: CandidateSource;
  hasLsId: boolean;
};

export type ResolvedDiscount = {
  winner: CandidateCode | null;
  attribution: Attribution | null;
  /** First-touch affiliate to credit, linked or not (the capture safety net). */
  intendedAffiliate: IntendedAffiliate | null;
  /** All candidates that survived resolution, sorted by savedCents DESC. Exposed for UI / logging. */
  candidates: CandidateCode[];
};

/**
 * Computes the total cents a discount saves over a fixed horizon. Single
 * scalar so the resolver can rank by Array.sort.
 *
 * Inputs in cents to keep the math integer-clean; outputs are rounded cents.
 */
export function computeSavedCents(
  discount: LsDiscount,
  plan: Plan,
  horizonMonths: number = COMPARISON_HORIZON_MONTHS,
): number {
  const perBillingDiscountCents =
    discount.amountType === "percent"
      ? Math.round((plan.priceCents * discount.amount) / 100)
      : Math.min(discount.amount, plan.priceCents);

  if (perBillingDiscountCents <= 0) return 0;

  const billingsInHorizon =
    plan.interval === "month" ? horizonMonths : Math.ceil(horizonMonths / 12);

  let applicableBillings: number;
  if (discount.duration === "once") {
    applicableBillings = 1;
  } else if (discount.duration === "forever") {
    applicableBillings = billingsInHorizon;
  } else {
    // repeating
    const months = discount.durationInMonths ?? 1;
    if (plan.interval === "month") {
      applicableBillings = Math.min(months, billingsInHorizon);
    } else {
      // Annual plan: any partial year still consumes a full billing.
      applicableBillings = Math.min(Math.ceil(months / 12), billingsInHorizon);
    }
  }

  if (applicableBillings <= 0) return 0;
  return perBillingDiscountCents * applicableBillings;
}

/**
 * Resolves raw candidates into `CandidateCode[]`. Dedupes by uppercase code
 * (keeping the first appearance, which is also the highest-priority source
 * after `gatherCandidates` ordered them). LS lookup + Supabase affiliate
 * lookup run in parallel per code. Anything that returns no LS discount is
 * silently dropped - bogus codes are not errors.
 */
export async function gatherCandidates(
  raw: RawCandidate[],
  plan: Plan,
  storeId: string,
): Promise<CandidateCode[]> {
  const seen = new Set<string>();
  const ordered: RawCandidate[] = [];
  for (const r of raw) {
    const code = typeof r.code === "string" ? r.code.trim().toUpperCase() : "";
    if (code.length === 0) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    ordered.push({ source: r.source, code });
  }

  const resolved = await Promise.all(
    ordered.map(async ({ source, code }) => {
      const [ls, owner] = await Promise.all([
        resolveLsForCandidate(source, code, storeId),
        withTimeout(lookupAffiliateOwnerByCode(code), AFFILIATE_LOOKUP_TIMEOUT_MS, null),
      ]);
      if (!ls) return null;
      // `isAffiliate` keeps its linked-only meaning (used by the stacking rule,
      // pickWinner and resolveAttribution): true only when LS has activated the
      // affiliate. `affiliateUserId` is set even for unlinked affiliates so the
      // intended referral can still be captured during the activation gap.
      const candidate: CandidateCode = {
        source,
        code: ls.code,
        ls,
        isAffiliate: Boolean(owner && owner.lsAffiliateId),
        lsAffiliateId: owner?.lsAffiliateId ?? null,
        affiliateUserId: owner?.affiliateUserId ?? null,
        savedCents: computeSavedCents(ls, plan),
      };
      return candidate;
    }),
  );

  return resolved.filter((c): c is CandidateCode => c !== null);
}

/**
 * WELCOME codes are our own discounts - we know their metadata at compile time
 * (see src/lib/promo.ts), so we don't need to round-trip LS just to read what
 * we already know. This also keeps the resolver functional when the LS API
 * is temporarily unreachable - the WELCOME tier still applies.
 */
function synthesizeWelcomeLs(code: string): LsDiscount | null {
  if (code === WELCOME_FIRST_CODE) {
    return {
      id: "welcome-first",
      code: WELCOME_FIRST_CODE,
      amount: DISCOUNT_PCT_FIRST,
      amountType: "percent",
      duration: "once",
      durationInMonths: null,
    };
  }
  if (code === WELCOME_RETURNING_CODE) {
    return {
      id: "welcome-returning",
      code: WELCOME_RETURNING_CODE,
      amount: DISCOUNT_PCT_RETURNING,
      amountType: "percent",
      duration: "once",
      durationInMonths: null,
    };
  }
  return null;
}

async function resolveLsForCandidate(
  source: CandidateSource,
  code: string,
  storeId: string,
): Promise<LsDiscount | null> {
  if (source === "welcome-cookie") {
    return synthesizeWelcomeLs(code);
  }
  // Typed / URL-sourced codes hit LS. (User-typed WELCOME30 also routes here -
  // LS will confirm it's published; we don't shortcut to the synth value because
  // the source tag matters for tie-breaks and audit.)
  return fetchDiscountByCode(code, storeId);
}

/**
 * Returns the code that saves the user the most money. Tie-break order:
 *   1. higher savedCents wins
 *   2. affiliate code wins (so attribution naturally lives on the winning code in ties)
 *   3. source priority url-code > typed > welcome-cookie (stable surface for repeatable outcomes)
 */
export function pickWinner(candidates: CandidateCode[]): CandidateCode | null {
  if (candidates.length === 0) return null;
  const sourceRank: Record<CandidateSource, number> = {
    "url-code": 0,
    typed: 1,
    "welcome-cookie": 2,
  };
  return [...candidates].sort((a, b) => {
    if (b.savedCents !== a.savedCents) return b.savedCents - a.savedCents;
    if (a.isAffiliate !== b.isAffiliate) return a.isAffiliate ? -1 : 1;
    return sourceRank[a.source] - sourceRank[b.source];
  })[0];
}

/**
 * First-touch attribution. URL/cookie-sourced affiliate beats a typed
 * affiliate; if neither URL nor cookie carries an affiliate, the typed code
 * gets credit. Independent of which code's discount actually won.
 */
export function resolveAttribution(candidates: CandidateCode[]): Attribution | null {
  const affiliates = candidates.filter((c) => c.isAffiliate && c.lsAffiliateId);
  if (affiliates.length === 0) return null;

  const priority: CandidateSource[] = ["url-code", "welcome-cookie", "typed"];
  for (const src of priority) {
    const match = affiliates.find((c) => c.source === src);
    if (match && match.lsAffiliateId) {
      return {
        lsAffiliateId: match.lsAffiliateId,
        sourceCode: match.code,
        source: match.source,
      };
    }
  }
  return null;
}

/**
 * First-touch intended affiliate, INCLUDING affiliates whose LS account isn't
 * activated yet (lsAffiliateId null). Same priority as resolveAttribution
 * (url-code > welcome-cookie > typed) but keyed off `affiliateUserId` so the
 * pre-activation gap is covered. Independent of which discount won, so an order
 * that ultimately used WELCOME30 is still attributed to the affiliate whose
 * link the customer arrived through (the ib_aff_src first-touch cookie).
 */
export function resolveIntendedAffiliate(
  candidates: CandidateCode[],
): IntendedAffiliate | null {
  const affiliates = candidates.filter((c) => c.affiliateUserId);
  if (affiliates.length === 0) return null;

  const priority: CandidateSource[] = ["url-code", "welcome-cookie", "typed"];
  for (const src of priority) {
    const match = affiliates.find((c) => c.source === src);
    if (match && match.affiliateUserId) {
      return {
        affiliateUserId: match.affiliateUserId,
        sourceCode: match.code,
        source: match.source,
        hasLsId: Boolean(match.lsAffiliateId),
      };
    }
  }
  return null;
}

/**
 * Affiliate-XOR-welcome stacking rule. A customer may apply either an
 * Affiliate-tracked code or a site-wide welcome-cookie code, not both.
 *
 * When any non-welcome-cookie candidate has `isAffiliate=true`, we drop
 * welcome-cookie candidates from the ranking so the Affiliate code wins
 * the discount comparison (and retains attribution). Without this filter,
 * WELCOME30/WELCOME15 silently undercuts the affiliate's branded code on
 * "best of 24-month NPV" ranking, paying the affiliate commission on a
 * site-wide discount that we'd also otherwise pay - double leakage.
 *
 * Mirrored in customer-facing copy: see "No discount stacking" in
 * public/legal/affiliate-terms.html Section 3(e).
 */
export function applyStackingRules(candidates: CandidateCode[]): CandidateCode[] {
  const hasAffiliate = candidates.some(
    (c) => c.isAffiliate && c.source !== "welcome-cookie",
  );
  if (!hasAffiliate) return candidates;
  return candidates.filter((c) => c.source !== "welcome-cookie");
}

/**
 * Builds the LS checkout `custom` fields that durably record the intended
 * affiliate on the order. Empty object when there's no affiliate to capture
 * (so spreading it is a no-op). The order_created webhook reads these back and
 * persists them to the orders table. Values must be strings (LS custom_data).
 *
 * Self-hosted program: we credit and pay every referral ourselves and never
 * append aff_ref, so LS pays no commission. Every capture is therefore
 * "pending", which tells the commission engine to owe the full promised rate.
 * The legacy path (self-hosting disabled) keeps the live-if-linked behavior so
 * the engine subtracts the 30% LS actually paid. `selfHosted` defaults to the
 * env flag but is injectable for tests.
 */
export function affiliateCaptureCustom(
  intended: IntendedAffiliate | null,
  selfHosted: boolean = selfHostedAffiliatesEnabled(),
): Record<string, string> {
  if (!intended) return {};
  return {
    ref_affiliate_user_id: intended.affiliateUserId,
    ref_affiliate_code: intended.sourceCode,
    ref_attribution_status: !selfHosted && intended.hasLsId ? "live" : "pending",
  };
}

export type ResolveInput = {
  typedCode: string | null | undefined;
  urlCode: string | null | undefined;
  cookieTier: PromoTier;
  plan: Plan;
  storeId: string;
};

/**
 * Top-level entrypoint used by /api/checkout (auth + guest). Returns the
 * winning discount code, the affiliate to credit (if any), and the full
 * candidate set for UI / logging.
 */
export async function resolveCheckoutDiscount(input: ResolveInput): Promise<ResolvedDiscount> {
  const welcomeCode =
    input.cookieTier === "first" ? WELCOME_FIRST_CODE : WELCOME_RETURNING_CODE;

  // Source order here determines dedupe winner for codes that appear in
  // multiple slots: url-code > typed > welcome-cookie.
  const raw: RawCandidate[] = [
    ...(input.urlCode ? [{ source: "url-code" as const, code: input.urlCode }] : []),
    ...(input.typedCode ? [{ source: "typed" as const, code: input.typedCode }] : []),
    { source: "welcome-cookie", code: welcomeCode },
  ];

  const allCandidates = await gatherCandidates(raw, input.plan, input.storeId);
  const candidates = applyStackingRules(allCandidates);
  const sortedCandidates = [...candidates].sort((a, b) => b.savedCents - a.savedCents);

  return {
    winner: pickWinner(candidates),
    attribution: resolveAttribution(candidates),
    intendedAffiliate: resolveIntendedAffiliate(candidates),
    candidates: sortedCandidates,
  };
}
