import { describe, it, expect } from "vitest";
import { pickBestCcRate } from "@/lib/asin-lookup";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("pickBestCcRate", () => {
  it("picks the highest-rate active campaign and its id", () => {
    const rate = pickBestCcRate(
      {
        brand: " Acme ",
        campaignIds: ["c1", "c2", "c3"],
        campaigns: [
          { r: 8, e: iso(NOW + 5 * DAY), s: 3 },
          { r: 15, e: iso(NOW + 9 * DAY), s: 1 },
          { r: 12, e: null, s: null },
        ],
      },
      NOW,
    );
    expect(rate).toEqual({
      ratePct: 15,
      brand: "Acme",
      endsAt: iso(NOW + 9 * DAY),
      campaignId: "c2",
    });
  });

  it("skips campaigns that ended more than a day ago", () => {
    const rate = pickBestCcRate(
      {
        campaignIds: ["old", "live"],
        campaigns: [
          { r: 30, e: iso(NOW - 2 * DAY), s: 1 },
          { r: 6, e: iso(NOW + DAY), s: 1 },
        ],
      },
      NOW,
    );
    expect(rate?.campaignId).toBe("live");
    expect(rate?.ratePct).toBe(6);
  });

  it("keeps a campaign that ended within the one-day grace", () => {
    const rate = pickBestCcRate(
      { campaignIds: ["x"], campaigns: [{ r: 10, e: iso(NOW - DAY / 2), s: 1 }] },
      NOW,
    );
    expect(rate?.ratePct).toBe(10);
  });

  it("returns null when every campaign has ended or none exist", () => {
    expect(
      pickBestCcRate({ campaignIds: ["a"], campaigns: [{ r: 9, e: iso(NOW - 3 * DAY), s: 1 }] }, NOW),
    ).toBeNull();
    expect(pickBestCcRate({}, NOW)).toBeNull();
  });

  it("falls back to the summary fields for rows without per-campaign tuples", () => {
    const rate = pickBestCcRate(
      { brand: "Acme", bestRate: 11, soonestExpiry: iso(NOW + DAY), campaignIds: ["only"] },
      NOW,
    );
    expect(rate).toEqual({ ratePct: 11, brand: "Acme", endsAt: iso(NOW + DAY), campaignId: "only" });
  });

  it("returns a null campaignId when ids and tuples are not parallel", () => {
    const rate = pickBestCcRate({ campaigns: [{ r: 7, e: null, s: null }] }, NOW);
    expect(rate?.campaignId).toBeNull();
  });
});
