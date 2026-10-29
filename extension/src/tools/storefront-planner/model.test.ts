import { describe, expect, it } from "vitest";
import { buildPlan, plannerCsv } from "./model";

const rate = (ratePct: number) => ({ ratePct, brand: null, endsAt: null });

describe("buildPlan", () => {
  const base = {
    ccFlagged: new Set(["AAAAAAAAAA", "BBBBBBBBBB"]),
    spccFlagged: new Set(["CCCCCCCCCC"]),
    dealFlagged: new Set(["BBBBBBBBBB", "DDDDDDDDDD"]),
    ccRates: { AAAAAAAAAA: rate(10), BBBBBBBBBB: rate(5) },
    spccRates: { CCCCCCCCCC: { epc: 0.4, budgetAvailability: null, brand: null } },
  };

  it("ranks campaign + deal first, then campaign by rate, then deal only", () => {
    const plan = buildPlan({
      ...base,
      videoAsins: [["AAAAAAAAAA", "BBBBBBBBBB"], ["CCCCCCCCCC", "DDDDDDDDDD", "ZZZZZZZZZZ"]],
    });
    expect(plan.rows.map((r) => r.asin)).toEqual([
      "BBBBBBBBBB",
      "AAAAAAAAAA",
      "CCCCCCCCCC",
      "DDDDDDDDDD",
    ]);
    expect(plan.scanned).toBe(5);
  });

  it("counts each video once per product", () => {
    const plan = buildPlan({
      ...base,
      videoAsins: [["AAAAAAAAAA", "AAAAAAAAAA"], ["AAAAAAAAAA"]],
    });
    expect(plan.rows[0]?.videos).toBe(2);
  });

  it("returns nothing when no featured product qualifies", () => {
    expect(buildPlan({ ...base, videoAsins: [["ZZZZZZZZZZ"]] }).rows).toEqual([]);
  });
});

describe("plannerCsv", () => {
  it("writes a header and one row per product", () => {
    const csv = plannerCsv(
      [{ asin: "AAAAAAAAAA", cc: rate(10), spcc: null, deal: true, videos: 2 }],
      "www.amazon.com",
    );
    expect(csv.split("\n")).toEqual([
      "asin,url,cc_rate_pct,cc_ends,spcc_epc,deal,videos",
      "AAAAAAAAAA,https://www.amazon.com/dp/AAAAAAAAAA,10,,,yes,2",
    ]);
  });
});
