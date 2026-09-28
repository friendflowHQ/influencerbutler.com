// Butler Score: a single 0-100 opportunity number that ranks a product the way
// a creator would weigh it, so search results can be sorted and any product
// gets a quick "how good is this" read. It complements the pass/fail Butler
// Approved seal (same signals, continuous instead of binary).
//
// Pure math over already-extracted signals, no Chrome APIs, unit-tested. Every
// input is nullable: a search tile knows only price and campaign membership,
// while a product page knows everything. A missing signal contributes a neutral
// half-weight rather than a penalty, mirroring the "unknown" handling in
// butler-approved/criteria.ts, so a thin tile is not unfairly sunk.

import type { Settings } from "../../storage/schema";

export type ScoreBand = "hot" | "warm" | "cool";

export type ButlerScore = {
  score: number; // 0-100, rounded
  band: ScoreBand;
  // Each part is the points that component contributed (already weighted), so
  // the UI can explain the number. They sum to `score`.
  parts: {
    commission: number;
    slot: number;
    demand: number;
    availability: number;
    price: number;
    campaign: number;
  };
};

export type ScoreInputs = {
  priceCents: number | null;
  // The commission rate that applies to this product (live SiteStripe, rate
  // card, or the user's default), already resolved by the caller. Null when
  // unknown (rare: only if no rate card and no default).
  commissionRatePct: number | null;
  // counts.influencer for the product, or null when video data has not loaded
  // (search tiles never have it until "Scan videos" runs).
  influencerVideos: number | null;
  boughtPastMonth: number | null;
  // Lifetime review count off the tile: only a demand fallback for when
  // "bought in past month" is absent (see demandUnit below).
  reviewCount: number | null;
  inStock: boolean | null;
  membership: { cc: boolean; spcc: boolean };
};

// Weights sum to 100. Commission and open-slot dominate because they are what
// actually decide whether a video here earns; campaign eligibility is a bonus.
const WEIGHTS = {
  commission: 30,
  slot: 25,
  demand: 20,
  availability: 10,
  price: 5,
  campaign: 10,
} as const;

// A dollar figure per sale, saturating at $5: a $5+ commission is as good as
// this component scores. Below that it scales linearly.
const COMMISSION_SATURATION_CENTS = 500;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function computeButlerScore(inputs: ScoreInputs, settings: Settings): ButlerScore {
  const approved = settings.approved;

  // Commission per sale in dollars, saturating. Neutral when price or rate
  // is unknown.
  const commissionUnit =
    inputs.priceCents !== null && inputs.commissionRatePct !== null
      ? clamp01(
          ((inputs.priceCents * Math.max(0, inputs.commissionRatePct)) / 100) /
            COMMISSION_SATURATION_CENTS,
        )
      : 0.5;

  // Open slot: fewer existing influencer videos than the approved ceiling is
  // wide open (1.0); at or past it, closing toward 0.
  const slotUnit =
    inputs.influencerVideos === null
      ? 0.5
      : clamp01(1 - inputs.influencerVideos / (approved.maxInfluencerVideos + 1));

  // Demand: "bought in past month" against the approved floor, full marks at
  // 4x the floor. When Amazon does not show that, the lifetime review count
  // stands in, capped at 0.7: reviews prove popularity but not current
  // velocity, so they can never outscore a live bought figure.
  const demandUnit =
    inputs.boughtPastMonth !== null
      ? clamp01(inputs.boughtPastMonth / Math.max(1, approved.minBoughtPerMonth * 4))
      : inputs.reviewCount !== null
        ? Math.min(0.7, clamp01(inputs.reviewCount / 2000))
        : 0.5;

  const availabilityUnit = inputs.inStock === null ? 0.5 : inputs.inStock ? 1 : 0;

  // Price floor: full marks at or above the floor, scaling down below it.
  const priceUnit =
    inputs.priceCents === null
      ? 0.5
      : clamp01(inputs.priceCents / Math.max(1, approved.minPrice * 100));

  // Campaign eligibility is a pure bonus: present = full, absent = none. When
  // the catalogue has not downloaded yet everything reads absent, which only
  // shifts all scores down uniformly and leaves the ranking intact.
  const campaignUnit = inputs.membership.cc || inputs.membership.spcc ? 1 : 0;

  const parts = {
    commission: commissionUnit * WEIGHTS.commission,
    slot: slotUnit * WEIGHTS.slot,
    demand: demandUnit * WEIGHTS.demand,
    availability: availabilityUnit * WEIGHTS.availability,
    price: priceUnit * WEIGHTS.price,
    campaign: campaignUnit * WEIGHTS.campaign,
  };

  const raw = Object.values(parts).reduce((sum, p) => sum + p, 0);
  const score = Math.round(raw);
  return { score, band: bandFor(score), parts };
}

export function bandFor(score: number): ScoreBand {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cool";
}
