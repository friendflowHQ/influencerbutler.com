// Campaign Radar score: a single 0-100 number that ranks a Creator Connections
// campaign the way a creator would weigh it, so the campaign grid can be sorted
// best-first and the strong campaigns highlighted. It is the sibling of the
// product Butler Score (tools/score/model.ts): same style (weights sum to 100,
// clamp01, a missing signal contributes a neutral half rather than a penalty),
// but different inputs. A campaign is judged by its commission RATE, how much
// runway it has left, how much budget is still unspent, and two personal signals
// the competition cannot see: whether the creator already owns the product (so
// they can film authentic content today) and whether they have already earned on
// it (a proven earner).
//
// Pure math over already-parsed signals, no Chrome APIs, unit-tested. Every
// input is nullable: the owned / proven-earner signals are absent for a user who
// never synced order history or never paired the desktop app, and read neutral
// rather than as a penalty so the rate/days/budget score still stands on its own.

export type CampaignScoreBand = "hot" | "warm" | "cool";

export type CampaignScore = {
  score: number; // 0-100, rounded
  band: CampaignScoreBand;
  // Each part is the (already weighted) points that component contributed, so
  // the UI can explain the number. They sum to `score`.
  parts: {
    commission: number;
    timing: number;
    budget: number;
    owned: number;
    earner: number;
    urgency: number;
  };
  // The resolved personal signals, carried through so the UI can tell a genuine
  // "owns it" (true) from the neutral half it awards when the signal is simply
  // unknown (null). Without this the panel cannot distinguish +22 (owns) from
  // +11 (unknown) and would mislabel the unknown case as "You own it".
  signals: {
    owned: boolean | null;
    provenEarner: boolean | null;
  };
};

export type CampaignScoreInputs = {
  // The campaign's commission rate as a percent (e.g. 15 for 15%), or null when
  // the grid did not surface it.
  commissionRatePct: number | null;
  // Whole days until the campaign's end date, or null when no end date parsed.
  // Negative (already expired) clamps to zero.
  daysRemaining: number | null;
  // Remaining (unspent) campaign budget in cents, or null when not surfaced.
  remainingBudgetCents: number | null;
  // The creator already bought this product (from synced order history). Null
  // when order history was never synced, so the signal is simply unknown.
  owned: boolean | null;
  // The creator has already earned affiliate commission on this product (from
  // the desktop app ledger). Null when the app was never paired.
  provenEarner: boolean | null;
  // How full the campaign is: creator slots claimed / cap, as 0-1. Null when the
  // fill map has not arrived (or Amazon stopped exposing it). Optional so callers
  // that never had fill data still type-check and read as neutral. This is the
  // Last Call Butler signal: a nearly-full-but-open campaign is the most urgent.
  fillPct?: number | null;
  // The campaign has hit its creator cap and can no longer be accepted. When
  // true, urgency collapses to zero: there is no point ranking a closed door high.
  fullyClaimed?: boolean | null;
};

// Creator slots claimed vs. cap as a 0-1 fraction, or null when either count is
// missing or the cap is zero. Shared by the overlay meter, the score, and the
// background Last Call poll so they all read fill the same way.
export function campaignFillPct(filled: number | null, total: number | null): number | null {
  if (filled === null || total === null || total <= 0) return null;
  return clamp01(filled / total);
}

// The user-tunable floors. This is the differentiator: Oink's highlight
// thresholds are fixed; ours are these, editable on the options page and live in
// the grid toolbar. Budget floor is in dollars to match `approved.minPrice`.
export type RadarThresholds = {
  minCommissionPct: number;
  minDaysRemaining: number;
  minRemainingBudget: number; // dollars
};

// Weights sum to 100. Commission dominates because the rate is what actually
// decides whether a video here earns. "Owned" is weighted heavily too: a product
// the creator already has on hand is the fastest, most authentic content to make.
// "Urgency" (how close to full) is the Last Call Butler signal: it never drags a
// healthy campaign below neutral, it only lifts a nearly-full-but-open one and
// zeroes out a campaign that has already closed.
const WEIGHTS = {
  commission: 35,
  timing: 12,
  budget: 8,
  owned: 22,
  earner: 8,
  urgency: 15,
} as const;

// A commission rate at or above 20% scores full marks on that component; below it
// scales linearly. CC rates typically run ~5-20%.
const RATE_SATURATION_PCT = 20;
// A campaign with 30+ days of runway left has all the timing room it needs. More
// runway = more time to publish and let the video earn (see the note below on
// direction). Fewer days scales down toward zero.
const DAYS_SATURATION = 30;
// $5,000 of unspent budget or more is as good as this component scores; the
// campaigns in the wild run ~$5k-$50k, so this saturates most healthy ones.
const BUDGET_SATURATION_CENTS = 500_000;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function computeCampaignScore(inputs: CampaignScoreInputs): CampaignScore {
  const commissionUnit =
    inputs.commissionRatePct === null
      ? 0.5
      : clamp01(Math.max(0, inputs.commissionRatePct) / RATE_SATURATION_PCT);

  // Timing: more days remaining is better (a longer runway to publish and earn).
  // If a live inspection shows creators actually prize urgency (grab it before it
  // closes) over runway, flip this single line to
  // `1 - clamp01(days / DAYS_SATURATION)` and nothing else changes.
  const timingUnit =
    inputs.daysRemaining === null
      ? 0.5
      : clamp01(Math.max(0, inputs.daysRemaining) / DAYS_SATURATION);

  const budgetUnit =
    inputs.remainingBudgetCents === null
      ? 0.5
      : clamp01(Math.max(0, inputs.remainingBudgetCents) / BUDGET_SATURATION_CENTS);

  // Personal signals: present = full, absent = none, unknown (never synced /
  // never paired) = neutral half, mirroring the campaign bonus in the product
  // model so an un-paired user is not unfairly sunk.
  const ownedUnit = inputs.owned === null ? 0.5 : inputs.owned ? 1 : 0;
  const earnerUnit = inputs.provenEarner === null ? 0.5 : inputs.provenEarner ? 1 : 0;

  // Urgency (Last Call): a fully claimed campaign is a closed door => 0. Unknown
  // fill reads neutral (0.5). Otherwise it ranges 0.5 (empty, not urgent) up to
  // 1.0 (nearly full but still open, grab it now), so fill only ever lifts a
  // healthy campaign, never sinks it below neutral for being fresh.
  const fillPct = inputs.fillPct ?? null;
  const fullyClaimed = inputs.fullyClaimed ?? null;
  const urgencyUnit = fullyClaimed ? 0 : fillPct === null ? 0.5 : 0.5 + 0.5 * clamp01(fillPct);

  const parts = {
    commission: commissionUnit * WEIGHTS.commission,
    timing: timingUnit * WEIGHTS.timing,
    budget: budgetUnit * WEIGHTS.budget,
    owned: ownedUnit * WEIGHTS.owned,
    earner: earnerUnit * WEIGHTS.earner,
    urgency: urgencyUnit * WEIGHTS.urgency,
  };

  const raw = Object.values(parts).reduce((sum, p) => sum + p, 0);
  const score = Math.round(raw);
  return {
    score,
    band: bandFor(score),
    parts,
    signals: { owned: inputs.owned, provenEarner: inputs.provenEarner },
  };
}

// The parts to surface in the "why is it good" breakdown, largest contribution
// first. Every part with points is shown EXCEPT the two personal signals, which
// make a factual claim about the creator ("You own it", "Proven earner") and so
// are shown only when the signal is genuinely true, never for the neutral half
// awarded when the signal is unknown (order history never synced / app never
// paired). The non-personal parts report a weighted contribution, not a claim,
// so their neutral halves are fine to show.
export type BreakdownPart = readonly [key: keyof CampaignScore["parts"], points: number];

export function visibleBreakdownParts(score: CampaignScore): BreakdownPart[] {
  return (Object.keys(score.parts) as Array<keyof CampaignScore["parts"]>)
    .map((k) => [k, score.parts[k]] as const)
    .filter(([k, v]) => {
      if (v <= 0) return false;
      if (k === "owned") return score.signals.owned === true;
      if (k === "earner") return score.signals.provenEarner === true;
      return true;
    })
    .sort((a, b) => b[1] - a[1]);
}

export function bandFor(score: number): CampaignScoreBand {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cool";
}

// Extra signals (beyond the score inputs) that raise the Butler's confidence in
// its read of a campaign: whether our catalogue had the standout product's
// demand, and whether Amazon exposed real conversion stats for the campaign.
export type CampaignConfidenceExtras = {
  hasDemand: boolean;
  hasCcStats: boolean;
};

// How sure the Butler is of a campaign read, 0-100. This is NOT the score: it is
// data completeness. A campaign whose commission, budget, runway, fill, and
// product demand are all known is read with high confidence; one where the grid
// surfaced only a commission rate is a low-confidence read even if that rate is
// great. Weights sum to 100 and each present signal contributes its weight, so
// the panel can say "83/100, 70 confidence" the way the competitor does, but
// honestly derived from what we actually had rather than invented by the model.
export function computeCampaignConfidence(
  inputs: CampaignScoreInputs,
  extras?: Partial<CampaignConfidenceExtras>,
): number {
  const signals: ReadonlyArray<readonly [boolean, number]> = [
    [inputs.commissionRatePct !== null, 30],
    [inputs.remainingBudgetCents !== null, 15],
    [inputs.daysRemaining !== null, 15],
    [(inputs.fillPct ?? null) !== null || (inputs.fullyClaimed ?? null) !== null, 10],
    [inputs.owned !== null || inputs.provenEarner !== null, 10],
    [Boolean(extras?.hasDemand), 12],
    [Boolean(extras?.hasCcStats), 8],
  ];
  const raw = signals.reduce((sum, [ok, w]) => sum + (ok ? w : 0), 0);
  return Math.round(Math.min(100, raw));
}

// Whether a campaign clears every user-set floor. The overlay highlights (draws
// the "pink border" equivalent on) only campaigns that pass, and the toolbar's
// "meets my thresholds" filter uses the same test. A null signal is treated as
// unknown and does NOT fail the floor (the campaign is not penalized for data the
// grid did not surface).
export function meetsRadarThresholds(
  inputs: CampaignScoreInputs,
  thresholds: RadarThresholds,
): boolean {
  if (inputs.commissionRatePct !== null && inputs.commissionRatePct < thresholds.minCommissionPct) {
    return false;
  }
  if (inputs.daysRemaining !== null && inputs.daysRemaining < thresholds.minDaysRemaining) {
    return false;
  }
  if (
    inputs.remainingBudgetCents !== null &&
    inputs.remainingBudgetCents < thresholds.minRemainingBudget * 100
  ) {
    return false;
  }
  return true;
}
