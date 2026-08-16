import type { Settings } from "../../storage/schema";
import type { CriterionState } from "./criteria";

// Butler Approved for a search-results tile, where the influencer/brand split
// of the video carousel is usually unknown: static /dp/ HTML exposes only the
// total video count. The verdict leans on the invariant
// influencerVideos <= totalVideos to prove the open-slot criterion from that
// upper bound whenever it can, and reports "likely" instead of overstating
// certainty when it cannot.

export type TileVerdictState = "approved" | "likely" | "no" | "unknown";

export type TileVerdictInputs = {
  priceCents: number | null;
  boughtPastMonth: number | null;
  // null until enrichment reads the product page.
  inStock: boolean | null;
  // Exact influencer count from a tab scan (or a cached one); always wins.
  influencerVideos: number | null;
  // Total video count from static enrichment; an upper bound on influencers.
  totalVideos: number | null;
  // Whether the product page has any video carousel at all; false together
  // with no totalVideos means zero videos of any kind.
  anyCarousel: boolean | null;
};

export type TileVerdict = {
  state: TileVerdictState;
  activelySelling: CriterionState;
  openSlot: CriterionState;
  inStock: CriterionState;
  priceFloor: CriterionState;
};

export function evaluateTileVerdict(
  inputs: TileVerdictInputs,
  approved: Settings["approved"],
): TileVerdict {
  const activelySelling: CriterionState =
    inputs.boughtPastMonth === null
      ? "unknown"
      : inputs.boughtPastMonth >= approved.minBoughtPerMonth
        ? "pass"
        : "fail";

  const inStock: CriterionState =
    inputs.inStock === null ? "unknown" : inputs.inStock ? "pass" : "fail";

  const priceFloor: CriterionState =
    inputs.priceCents === null
      ? "unknown"
      : inputs.priceCents >= approved.minPrice * 100
        ? "pass"
        : "fail";

  const openSlot = openSlotState(inputs, approved.maxInfluencerVideos);

  const all = [activelySelling, openSlot, inStock, priceFloor];
  let state: TileVerdictState;
  if (all.some((s) => s === "fail")) {
    state = "no";
  } else if (all.every((s) => s === "pass")) {
    state = "approved";
  } else if (
    openSlot === "unknown" &&
    activelySelling === "pass" &&
    inStock === "pass" &&
    priceFloor === "pass"
  ) {
    state = "likely";
  } else {
    state = "unknown";
  }

  return { state, activelySelling, openSlot, inStock, priceFloor };
}

function openSlotState(inputs: TileVerdictInputs, maxInfluencerVideos: number): CriterionState {
  // An exact count (tab scan) is authoritative in both directions.
  if (inputs.influencerVideos !== null) {
    return inputs.influencerVideos <= maxInfluencerVideos ? "pass" : "fail";
  }
  // No carousel and no counted videos: the page has zero videos of any kind,
  // so zero influencer videos (same inference the store overlay applies).
  if (inputs.anyCarousel === false && !inputs.totalVideos) return "pass";
  if (inputs.totalVideos !== null) {
    // The total bounds the influencer count from above: a small total proves
    // an open slot, a large one proves nothing (they could all be customer
    // videos), so the verdict stays honest at "unknown".
    return inputs.totalVideos <= maxInfluencerVideos ? "pass" : "unknown";
  }
  return "unknown";
}
