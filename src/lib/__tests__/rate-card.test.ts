import { describe, expect, it } from "vitest";
import { parseRateCard, type RawSnapshot } from "../rate-card";

const snapshot: RawSnapshot = {
  version: "2026-07-06",
  harvestedAt: "2026-07-06T00:00:00.000Z",
  byMarketplace: {
    "amazon.com": {
      marketplace: "amazon.com",
      sourceUrl: "https://affiliate-program.amazon.com/statement",
      lastCheckedAt: 1_720_000_000_000,
      tables: [
        { title: "Some other table", headers: ["x"], rows: [["ignore", "99%"]] },
        {
          title: "Fixed Standard Commission Income Rates",
          headers: ["Category", "Fixed Commission Rate"],
          rows: [
            ["Luxury Beauty, Amazon Explore", "10.00%"],
            ["Furniture, Home, Lawn & Garden", "3.00%"],
            ["Televisions, Digital Video Games", "2.00%"],
            ["All Other Categories", "4.00%"],
          ],
        },
      ],
    },
  },
};

describe("parseRateCard", () => {
  it("returns null for an empty or missing snapshot", () => {
    expect(parseRateCard(null)).toBeNull();
    expect(parseRateCard({})).toBeNull();
    expect(parseRateCard({ byMarketplace: {} })).toBeNull();
  });

  it("picks the fixed-commission table and pulls the catch-all default out", () => {
    const card = parseRateCard(snapshot);
    expect(card).not.toBeNull();
    expect(card!.version).toBe("2026-07-06");
    expect(card!.defaultRatePct).toBe(4);
    // The catch-all row is not left in the category rows.
    expect(card!.rows.some((r) => /all other/i.test(r.label))).toBe(false);
    expect(card!.rows).toHaveLength(3);
  });

  it("splits multi-category cells into match tokens", () => {
    const card = parseRateCard(snapshot)!;
    const luxury = card.rows.find((r) => r.ratePct === 10)!;
    expect(luxury.tokens).toContain("luxury beauty");
    expect(luxury.tokens).toContain("amazon explore");
  });

  it("normalizes the marketplace and falls back to amazon.com", () => {
    expect(parseRateCard(snapshot, "www.amazon.com")!.marketplace).toBe("amazon.com");
    // Unknown marketplace falls back to the US entry rather than returning null.
    expect(parseRateCard(snapshot, "amazon.somewhere")!.defaultRatePct).toBe(4);
  });

  it("skips rows without a parseable percentage", () => {
    const card = parseRateCard({
      byMarketplace: {
        "amazon.com": {
          tables: [
            {
              title: "Fixed Commission Rates",
              rows: [
                ["Books", "n/a"],
                ["Kitchen", "4.5%"],
              ],
            },
          ],
        },
      },
    })!;
    expect(card.rows).toHaveLength(1);
    expect(card.rows[0]!.ratePct).toBe(4.5);
  });
});
