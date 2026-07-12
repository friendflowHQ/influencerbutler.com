import { describe, expect, it } from "vitest";
import {
  buildCsv,
  computeEngagementRate,
  decodeBioLinkRedirect,
  emailDedupeKey,
  exceedsFollowerCap,
  extractEmailsFromText,
  isWithinRecentDays,
  normalizeBioLinkUrl,
  normalizeHashtag,
  normalizeUsername,
  parseCount,
  parseMailtoEmail,
} from "./helpers";
import { findingKey } from "../transport/types";
import type { InstagramCreatorFinding } from "../transport/types";

describe("normalizeUsername / normalizeHashtag", () => {
  it("strips @, urls, and lowercases handles", () => {
    expect(normalizeUsername("@Jen_Hamilton")).toBe("jen_hamilton");
    expect(normalizeUsername("https://www.instagram.com/somethingnavy/")).toBe("somethingnavy");
  });

  it("lifts a bare tag from #, whitespace, and explore urls", () => {
    expect(normalizeHashtag("#AmazonFinds")).toBe("amazonfinds");
    expect(normalizeHashtag("https://www.instagram.com/explore/tags/ugccreator/")).toBe("ugccreator");
    expect(normalizeHashtag("two words")).toBe(""); // not a single tag
  });
});

describe("parseCount", () => {
  it("expands K/M/B suffixes", () => {
    expect(parseCount("12.3K")).toBe(12_300);
    expect(parseCount("1.2M")).toBe(1_200_000);
    expect(parseCount("2,345")).toBe(2345);
    expect(parseCount("nope")).toBeNull();
  });
});

describe("exceedsFollowerCap", () => {
  it("keeps creators when cap is 0 or count unknown, drops over-cap", () => {
    expect(exceedsFollowerCap(500_000, 0)).toBe(false); // no cap
    expect(exceedsFollowerCap(null, 1000)).toBe(false); // unknown -> keep
    expect(exceedsFollowerCap(1500, 1000)).toBe(true);
    expect(exceedsFollowerCap(1000, 1000)).toBe(false);
  });
});

describe("isWithinRecentDays", () => {
  const now = Date.parse("2026-07-12T00:00:00Z");
  it("treats 0 days as no limit and keeps unknown dates", () => {
    expect(isWithinRecentDays("2000-01-01", 0, now)).toBe(true);
    expect(isWithinRecentDays("not-a-date", 7, now)).toBe(true);
  });
  it("accepts unix seconds (IG taken_at) and enforces the window", () => {
    const twoDaysAgo = Math.floor(now / 1000) - 2 * 24 * 60 * 60;
    expect(isWithinRecentDays(twoDaysAgo, 7, now)).toBe(true);
    const tenDaysAgo = Math.floor(now / 1000) - 10 * 24 * 60 * 60;
    expect(isWithinRecentDays(tenDaysAgo, 7, now)).toBe(false);
  });
});

describe("email extraction", () => {
  it("pulls and dedupes emails from bio text", () => {
    expect(extractEmailsFromText("reach me: Hi@Brand.com or hi@brand.com")).toEqual(["hi@brand.com"]);
  });
  it("reads a mailto button href", () => {
    expect(parseMailtoEmail("mailto:collabs@creator.co?subject=Hi")).toBe("collabs@creator.co");
    expect(parseMailtoEmail("https://creator.co")).toBe("");
  });
});

describe("bio link handling", () => {
  it("decodes the l.instagram.com redirect", () => {
    expect(
      decodeBioLinkRedirect("https://l.instagram.com/?u=https%3A%2F%2Fcreator.co%2Fshop&e=abc"),
    ).toBe("https://creator.co/shop");
  });
  it("normalizes bare hosts and rejects non-web schemes", () => {
    expect(normalizeBioLinkUrl("creator.co")).toBe("https://creator.co/");
    expect(normalizeBioLinkUrl("mailto:hi@creator.co")).toBe("");
  });
});

describe("computeEngagementRate", () => {
  it("uses likes+comments when the majority expose likes", () => {
    const out = computeEngagementRate({
      samples: [
        { likeCount: 100, commentCount: 10 },
        { likeCount: 200, commentCount: 20 },
      ],
      followerCount: 1000,
    });
    expect(out.engagementBasis).toBe("likes+comments");
    expect(out.engagementRate).toBe(16.5); // avg of 11% and 22%
  });
  it("falls back to comments-only when likes are hidden", () => {
    const out = computeEngagementRate({
      samples: [
        { likeCount: null, commentCount: 10 },
        { likeCount: null, commentCount: 30 },
      ],
      followerCount: 1000,
    });
    expect(out.engagementBasis).toBe("comments-only");
    expect(out.engagementRate).toBe(2); // avg of 1% and 3%
  });
});

describe("emailDedupeKey + findingKey", () => {
  it("keys a creator on (username, email), day-independent", () => {
    expect(emailDedupeKey("@Creator", "Hi@Brand.com ")).toBe("creator::hi@brand.com");
    const finding: InstagramCreatorFinding = {
      type: "instagram_creator",
      username: "creator",
      email: "hi@brand.com",
      sourceHashtag: "amazonfinds",
      detectedAt: "2026-07-12T10:00:00Z",
    };
    expect(findingKey(finding)).toBe("instagram_creator:creator:hi@brand.com");
  });
});

describe("buildCsv", () => {
  it("emits header + quoted cells in column order", () => {
    const csv = buildCsv(
      [{ profileUsername: "creator", creatorEmail: "hi@brand.com", sourceHashtag: "amazon, finds" }],
      ["profileUsername", "creatorEmail", "sourceHashtag"],
    );
    expect(csv).toBe(
      'profileUsername,creatorEmail,sourceHashtag\ncreator,hi@brand.com,"amazon, finds"',
    );
  });
});
