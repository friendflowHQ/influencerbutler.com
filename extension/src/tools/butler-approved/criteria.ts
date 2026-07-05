import type { ProductSignals } from "../../amazon/product-signals";
import type { VideoCounts } from "../../transport/types";
import type { Settings } from "../../storage/schema";

// Butler Approved: a product is worth making content for when all four
// criteria pass. Pure evaluation over already-extracted signals; when a
// signal could not be read the criterion reports "unknown" instead of
// silently passing or failing, so a broken selector is visible, not a lie.

export type CriterionState = "pass" | "fail" | "unknown";

export type CriterionResult = {
  key: "activelySelling" | "openSlot" | "inStock" | "priceFloor";
  label: string;
  state: CriterionState;
};

export type ApprovedVerdict = {
  approved: boolean;
  criteria: CriterionResult[];
};

export function evaluateApproved(
  signals: ProductSignals,
  counts: VideoCounts | null,
  settings: Settings["approved"],
): ApprovedVerdict {
  const criteria: CriterionResult[] = [
    {
      key: "activelySelling",
      label: `${settings.minBoughtPerMonth}+ bought in past month`,
      state:
        signals.boughtPastMonth === null
          ? "unknown"
          : signals.boughtPastMonth >= settings.minBoughtPerMonth
            ? "pass"
            : "fail",
    },
    {
      key: "openSlot",
      label: `Fewer than ${settings.maxInfluencerVideos + 1} influencer videos`,
      state:
        counts === null
          ? "unknown"
          : counts.influencer <= settings.maxInfluencerVideos
            ? "pass"
            : "fail",
    },
    {
      key: "inStock",
      label: "In stock",
      state: signals.inStock ? "pass" : "fail",
    },
    {
      key: "priceFloor",
      label: `Price at least $${settings.minPrice}`,
      state:
        signals.priceCents === null
          ? "unknown"
          : signals.priceCents >= settings.minPrice * 100
            ? "pass"
            : "fail",
    },
  ];

  return {
    approved: criteria.every((c) => c.state === "pass"),
    criteria,
  };
}

export function criteriaToRecord(verdict: ApprovedVerdict): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const criterion of verdict.criteria) {
    record[criterion.key] = criterion.state === "pass";
  }
  return record;
}
