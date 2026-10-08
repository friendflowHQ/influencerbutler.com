/**
 * Summary: Unit tests for the audience A/B split, the opened_nonpaid upper
 *   bound, and the "did not open an earlier campaign" audience's validator and
 *   set logic. All pure; the DB-touching resolver is covered by manual QA.
 * Dependencies: vitest, @/lib/email-audience.
 */

import { describe, it, expect } from "vitest";
import { nonOpeners, parseAudience, splitBucket } from "@/lib/email-audience";

const CAMPAIGN_ID = "7c71e6d3-102b-4b84-8570-72eeea0e4939";

describe("splitBucket", () => {
  it("is stable, case-insensitive and trims whitespace", () => {
    const a = splitBucket("Jane.Doe@Example.com", 2);
    expect(splitBucket("jane.doe@example.com", 2)).toBe(a);
    expect(splitBucket("  JANE.DOE@EXAMPLE.COM ", 2)).toBe(a);
    expect(splitBucket("jane.doe@example.com", 2)).toBe(a);
  });

  it("always returns a bucket in range", () => {
    for (let i = 0; i < 500; i += 1) {
      const bucket = splitBucket(`user${i}@example.com`, 3);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(3);
    }
  });

  it("makes two disjoint halves that cover everyone and are roughly balanced", () => {
    const emails = Array.from({ length: 10000 }, (_, i) => `person${i}@mail${i % 97}.com`);
    const a = emails.filter((e) => splitBucket(e, 2) === 0);
    const b = emails.filter((e) => splitBucket(e, 2) === 1);
    expect(a.length + b.length).toBe(emails.length);
    expect(new Set([...a, ...b]).size).toBe(emails.length);
    // Within 5 percentage points of an even split.
    expect(Math.abs(a.length - b.length)).toBeLessThan(emails.length * 0.1);
  });
});

describe("parseAudience split", () => {
  it("keeps a valid split on any audience kind", () => {
    expect(parseAudience({ kind: "all_contacts", split: { index: 1, of: 2 } })).toEqual({
      kind: "all_contacts",
      split: { index: 1, of: 2 },
    });
    expect(
      parseAudience({ kind: "opened_nonpaid", minOpens: 1, maxOpens: 2, split: { index: 0, of: 2 } }),
    ).toEqual({ kind: "opened_nonpaid", minOpens: 1, maxOpens: 2, split: { index: 0, of: 2 } });
  });

  it("omits split when none was sent", () => {
    expect(parseAudience({ kind: "all_contacts" })).toEqual({ kind: "all_contacts" });
    expect(parseAudience({ kind: "all_contacts", split: null })).toEqual({ kind: "all_contacts" });
  });

  it("rejects an invalid split rather than silently ignoring it", () => {
    for (const split of [
      { index: 2, of: 2 },
      { index: -1, of: 2 },
      { index: 0, of: 1 },
      { index: 0, of: 9 },
      { index: 0.5, of: 2 },
      { index: "0", of: 2 },
      "half",
    ]) {
      expect(parseAudience({ kind: "all_contacts", split })).toBeNull();
    }
  });
});

describe("parseAudience opened_nonpaid maxOpens", () => {
  it("keeps an inclusive maximum at or above the minimum", () => {
    expect(parseAudience({ kind: "opened_nonpaid", minOpens: 1, maxOpens: 2 })).toEqual({
      kind: "opened_nonpaid",
      minOpens: 1,
      maxOpens: 2,
    });
    expect(parseAudience({ kind: "opened_nonpaid", minOpens: 3, maxOpens: 3 })).toEqual({
      kind: "opened_nonpaid",
      minOpens: 3,
      maxOpens: 3,
    });
  });

  it("drops a maximum below the minimum or a non-number", () => {
    expect(parseAudience({ kind: "opened_nonpaid", minOpens: 3, maxOpens: 2 })).toEqual({
      kind: "opened_nonpaid",
      minOpens: 3,
    });
    expect(parseAudience({ kind: "opened_nonpaid", minOpens: 1, maxOpens: "two" })).toEqual({
      kind: "opened_nonpaid",
      minOpens: 1,
    });
  });
});

describe("campaign_nonopeners", () => {
  it("accepts a campaign uuid (lowercased) and rejects anything else", () => {
    expect(parseAudience({ kind: "campaign_nonopeners", campaignId: CAMPAIGN_ID.toUpperCase() })).toEqual({
      kind: "campaign_nonopeners",
      campaignId: CAMPAIGN_ID,
    });
    expect(parseAudience({ kind: "campaign_nonopeners", campaignId: "not-a-uuid" })).toBeNull();
    expect(parseAudience({ kind: "campaign_nonopeners" })).toBeNull();
    expect(parseAudience({ kind: "campaign_nonopeners", campaignId: 5 })).toBeNull();
  });

  it("nonOpeners returns recipients who are not in the opener set", () => {
    const sent = ["a@x.com", "b@x.com", "c@x.com", "d@x.com"];
    expect(nonOpeners(sent, new Set(["b@x.com", "d@x.com"]))).toEqual(["a@x.com", "c@x.com"]);
    expect(nonOpeners(sent, new Set())).toEqual(sent);
    expect(nonOpeners([], new Set(["a@x.com"]))).toEqual([]);
  });
});
