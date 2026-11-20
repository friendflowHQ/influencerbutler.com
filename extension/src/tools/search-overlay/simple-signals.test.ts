import { describe, expect, it } from "vitest";
import { bandsFor, computeBands, simpleSignals, MIN_PAGE_SAMPLE, type PageBands, type SimpleInput } from "./simple-signals";

const base: SimpleInput = {
  commissionCents: null,
  commissionText: null,
  units: null,
  unitsEstimated: false,
  showCampaign: true,
  campaign: { open: false, detail: null, lookup: "done" },
};
const noBands: PageBands = { commission: null, units: null };

describe("bandsFor", () => {
  it("needs a minimum sample", () => {
    expect(bandsFor([1, 2, 3, 4, 5])).toBeNull();
    expect(MIN_PAGE_SAMPLE).toBe(6);
    expect(bandsFor([1, 2, 3, 4, 5, 6])).not.toBeNull();
  });

  it("ignores nulls when counting the sample", () => {
    expect(bandsFor([1, 2, 3, null, null, null, 4, 5])).toBeNull();
  });

  it("puts the top third at good", () => {
    const b = bandsFor([10, 20, 30, 40, 50, 60]);
    expect(b).toEqual({ goodMin: 50, neutralMin: 30 });
  });

  it("does not crown most of the page when values tie at the cutoff", () => {
    const zeros = bandsFor([0, 0, 0, 0, 0, 100]);
    expect(zeros).toEqual({ goodMin: 100, neutralMin: 100 });
    const ones = bandsFor([1, 1, 1, 1, 1, 5]);
    expect(ones).toEqual({ goodMin: 5, neutralMin: 5 });
    const s = (v: number) => simpleSignals({ ...base, commissionCents: v, commissionText: "$" + v }, { commission: zeros, units: null }, "en")[0]?.state;
    expect(s(0)).toBe("low");
    expect(s(100)).toBe("good");
  });

  it("crowns nobody when one tied value fills over a third of the page, but still marks the minimum low", () => {
    const b = bandsFor([9, 9, 9, 9, 9, 1]);
    expect(b).toEqual({ goodMin: Infinity, neutralMin: 9 });
  });

  it("crowns nothing on a flat page", () => {
    const b = bandsFor([5, 5, 5, 5, 5, 5]);
    expect(b).not.toBeNull();
    const s = simpleSignals({ ...base, commissionCents: 5, commissionText: "$0.05" }, { commission: b, units: null }, "en");
    expect(s[0]?.state).toBe("neutral");
  });
});

describe("simpleSignals", () => {
  const bands = computeBands([
    { commissionCents: 10, units: 10 },
    { commissionCents: 20, units: 20 },
    { commissionCents: 30, units: 30 },
    { commissionCents: 40, units: 40 },
    { commissionCents: 50, units: 50 },
    { commissionCents: 60, units: 60 },
  ]);

  it("ranks within the page when there is a sample", () => {
    const s = simpleSignals({ ...base, commissionCents: 60, commissionText: "$0.60", units: 10 }, bands, "en");
    expect(s[0]).toMatchObject({ kind: "pays", state: "good" });
    expect(s[0]?.text).toContain("Pays well");
    expect(s[0]?.tip).toContain("top third");
    expect(s[1]).toMatchObject({ kind: "sells", state: "low" });
  });

  it("uses fixed levels on a small page and says so", () => {
    const s = simpleSignals({ ...base, commissionCents: 250, commissionText: "$2.50", units: 400 }, noBands, "en");
    expect(s[0]?.state).toBe("good");
    expect(s[0]?.tip).toContain("fixed level");
    expect(s[1]?.state).toBe("good");
  });

  it("never rates a local estimate good on the fixed level", () => {
    const s = simpleSignals({ ...base, units: 900, unitsEstimated: true }, noBands, "en");
    expect(s[1]?.state).toBe("neutral");
    expect(s[1]?.tip).toContain("estimated");
  });

  it("marks missing data unknown", () => {
    const s = simpleSignals(base, bands, "en");
    expect(s[0]?.state).toBe("unknown");
    expect(s[1]?.state).toBe("unknown");
  });

  it("campaign states: open, none, checking, failed", () => {
    const open = simpleSignals({ ...base, campaign: { open: true, detail: "12% commission", lookup: "done" } }, noBands, "en");
    expect(open[2]).toMatchObject({ kind: "campaign", state: "good" });
    expect(open[2]?.tip).toContain("12%");
    expect(simpleSignals(base, noBands, "en")[2]?.text).toContain("No campaign");
    expect(simpleSignals({ ...base, campaign: { open: false, detail: null, lookup: "pending" } }, noBands, "en")[2]?.text).toContain("Checking");
    expect(simpleSignals({ ...base, campaign: { open: false, detail: null, lookup: "failed" } }, noBands, "en")[2]?.state).toBe("unknown");
  });

  it("drops the campaign signal for retailers without campaigns", () => {
    const s = simpleSignals({ ...base, showCampaign: false }, noBands, "en");
    expect(s.map((x) => x.kind)).toEqual(["pays", "sells"]);
  });

  it("localizes labels", () => {
    expect(simpleSignals({ ...base, commissionCents: 250, commissionText: "$2.50" }, noBands, "es")[0]?.text).toContain("Paga bien");
    expect(simpleSignals({ ...base, commissionCents: 250, commissionText: "$2.50" }, noBands, "fr")[0]?.text).toContain("Bien paye");
  });
});
