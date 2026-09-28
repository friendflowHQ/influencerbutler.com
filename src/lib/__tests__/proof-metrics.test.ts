import { describe, expect, it } from "vitest";

import {
  composeProofMetrics,
  DEFAULT_PROOF_CONFIG,
  PROOF_METRICS,
  type ProofConfig,
  type ProofMetricKey,
} from "../proof-metrics";

const liveCounts = (
  partial: Partial<Record<ProofMetricKey, number>>,
): Record<ProofMetricKey, number> => ({
  deals_posted: 0,
  product_scans: 0,
  orders_analyzed: 0,
  campaigns_accepted: 0,
  social_posts_published: 0,
  creator_messaged: 0,
  benable_list_optimized: 0,
  ...partial,
});

describe("composeProofMetrics", () => {
  it("adds the baseline offset to the live count for each metric", () => {
    const config: ProofConfig = {
      enabled: true,
      baselines: {
        deals_posted: 100000,
        product_scans: 500000,
        orders_analyzed: 0,
        campaigns_accepted: 25000,
        social_posts_published: 0,
        creator_messaged: 0,
        benable_list_optimized: 0,
      },
      labels: {},
    };
    const out = composeProofMetrics(
      config,
      liveCounts({ deals_posted: 12, product_scans: 340, campaigns_accepted: 7 }),
    );
    const byKey = Object.fromEntries(out.map((m) => [m.key, m.value]));
    expect(byKey.deals_posted).toBe(100012);
    expect(byKey.product_scans).toBe(500340);
    expect(byKey.campaigns_accepted).toBe(25007);
  });

  it("returns one entry per registered metric, in registry order", () => {
    const out = composeProofMetrics(DEFAULT_PROOF_CONFIG, liveCounts({}));
    expect(out.map((m) => m.key)).toEqual(PROOF_METRICS.map((m) => m.key));
  });

  it("falls back to the default label and treats a missing baseline as zero", () => {
    const config: ProofConfig = { enabled: true, baselines: {} as never, labels: {} };
    const out = composeProofMetrics(config, liveCounts({ deals_posted: 5 }));
    const deals = out.find((m) => m.key === "deals_posted");
    expect(deals?.value).toBe(5);
    expect(deals?.label).toBe("Deals Posted");
  });

  it("uses a configured label override when present", () => {
    const config: ProofConfig = {
      enabled: true,
      baselines: DEFAULT_PROOF_CONFIG.baselines,
      labels: { deals_posted: "Bargains Surfaced" },
    };
    const out = composeProofMetrics(config, liveCounts({}));
    expect(out.find((m) => m.key === "deals_posted")?.label).toBe("Bargains Surfaced");
  });
});
