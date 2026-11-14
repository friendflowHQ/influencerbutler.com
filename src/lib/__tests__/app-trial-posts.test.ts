import { describe, expect, it } from "vitest";
import { normalizePostsSummary, postsLineFor, POSTS_SUMMARY_MAX_AGE_MS } from "@/lib/app-trial-posts";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const fresh = new Date(NOW - 3600 * 1000).toISOString();

describe("app-trial own-posts summary", () => {
  it("keeps only clamped numbers and a known event label", () => {
    expect(normalizePostsSummary({ deals: "7", campaigns: -3, event: 99999, eventLabel: "<a href=x>Win</a>", bestPerSale: 2.704 })).toEqual({
      deals: 7, campaigns: 0, event: 500, eventLabel: "", bestPerSale: 2.7,
    });
    expect(normalizePostsSummary({ eventLabel: "Black Friday", bestPerSale: 5000 })).toMatchObject({ eventLabel: "Black Friday", bestPerSale: null });
    expect(normalizePostsSummary("nope")).toBeNull();
  });

  it("builds a plain line with the event first and the Gold and Platinum note", () => {
    const s = normalizePostsSummary({ deals: 5, event: 2, campaigns: 4, eventLabel: "Black Friday", bestPerSale: 2.7 });
    const line = postsLineFor(s, fresh, NOW);
    expect(line).toBe(
      "When your app last checked your storefront, 2 were in Black Friday deals, 3 were on sale and 4 had open Creator Connections campaigns (those are for Gold and Platinum creators). The best one earns about $2.70 per sale. Open Influencer Butler and the Home screen has a caption ready for each one, linked to your own post.",
    );
    expect(line).not.toMatch(/https?:|\u2014/);
  });

  it("says nothing when the check is stale or empty", () => {
    const s = normalizePostsSummary({ deals: 3 });
    expect(postsLineFor(s, new Date(NOW - POSTS_SUMMARY_MAX_AGE_MS - 1000).toISOString(), NOW)).toBe("");
    expect(postsLineFor(normalizePostsSummary({}), fresh, NOW)).toBe("");
    expect(postsLineFor(null, fresh, NOW)).toBe("");
    expect(postsLineFor(normalizePostsSummary({ campaigns: 1 }), fresh, NOW)).toContain("1 had an open Creator Connections campaign");
  });
});
