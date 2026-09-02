/**
 * Summary: Unit tests for the email marketing engine's pure validators - the
 *   audience parser (which gates who a campaign can reach), the pasted-list
 *   parser, tag normalization, and the tracking category keys. These are the
 *   security-relevant, deterministic pieces; the DB-touching resolveAudience /
 *   send engine are covered by manual QA.
 * Dependencies: vitest, @/lib/email-audience, @/lib/email-marketing. No env or
 *   network needed - every function under test is pure.
 */

import { describe, it, expect } from "vitest";
import { parseAudience, parseEmailList, normalizeTag } from "@/lib/email-audience";
import {
  shortId,
  campaignCategory,
  stepCategory,
  sequenceRunBudget,
  marketingRunBudget,
  nextSendTime,
  sequenceContactTag,
  sequencePlatformTags,
} from "@/lib/email-marketing";

const iso = (ms: number) => new Date(ms).toISOString();

describe("normalizeTag", () => {
  it("lowercases, trims, and hyphenates spaces", () => {
    expect(normalizeTag("  VIP Leads ")).toBe("vip-leads");
    expect(normalizeTag("Black Friday 2026")).toBe("black-friday-2026");
  });

  it("accepts allowed characters and rejects the rest", () => {
    expect(normalizeTag("webinar_q1")).toBe("webinar_q1");
    expect(normalizeTag("a")).toBe("a");
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag("-leading-hyphen")).toBeNull(); // must start alphanumeric
  });

  it("rejects tags longer than 40 characters", () => {
    expect(normalizeTag("a".repeat(40))).toBe("a".repeat(40));
    expect(normalizeTag("a".repeat(41))).toBeNull();
  });
});

describe("parseEmailList", () => {
  it("splits on newlines, commas, semicolons, and spaces", () => {
    const { emails, invalid } = parseEmailList("a@x.com, b@x.com; c@x.com\nd@x.com e@x.com");
    expect(emails).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
    expect(invalid).toBe(0);
  });

  it("lowercases and dedupes", () => {
    const { emails } = parseEmailList("A@X.com\na@x.com\nA@x.COM");
    expect(emails).toEqual(["a@x.com"]);
  });

  it("counts invalid entries without including them", () => {
    const { emails, invalid } = parseEmailList("good@x.com notanemail also-bad other@y.com");
    expect(emails).toEqual(["good@x.com", "other@y.com"]);
    expect(invalid).toBe(2);
  });

  it("respects the cap while still counting the overflow as dropped-not-invalid", () => {
    const { emails } = parseEmailList("a@x.com b@x.com c@x.com", 2);
    expect(emails).toHaveLength(2);
  });
});

describe("parseAudience", () => {
  it("accepts all_contacts", () => {
    expect(parseAudience({ kind: "all_contacts" })).toEqual({ kind: "all_contacts" });
  });

  it("normalizes a tag audience", () => {
    expect(parseAudience({ kind: "tag", tag: "VIP Leads" })).toEqual({
      kind: "tag",
      tag: "vip-leads",
    });
    expect(parseAudience({ kind: "tag", tag: "!!!" })).toBeNull();
    expect(parseAudience({ kind: "tag" })).toBeNull();
  });

  it("allow-lists segments", () => {
    for (const segment of ["trial", "pro", "churned", "newsletter"] as const) {
      expect(parseAudience({ kind: "segment", segment })).toEqual({ kind: "segment", segment });
    }
    expect(parseAudience({ kind: "segment", segment: "admins" })).toBeNull();
    expect(parseAudience({ kind: "segment" })).toBeNull();
  });

  it("cleans a pasted audience and rejects an empty one", () => {
    const parsed = parseAudience({ kind: "pasted", emails: ["A@x.com", "bad", "b@x.com"] });
    expect(parsed).toEqual({ kind: "pasted", emails: ["a@x.com", "b@x.com"] });
    expect(parseAudience({ kind: "pasted", emails: ["nope"] })).toBeNull();
    expect(parseAudience({ kind: "pasted", emails: [] })).toBeNull();
  });

  it("rejects unknown or malformed shapes", () => {
    expect(parseAudience(null)).toBeNull();
    expect(parseAudience("all_contacts")).toBeNull();
    expect(parseAudience({ kind: "everyone" })).toBeNull();
    expect(parseAudience({})).toBeNull();
  });
});

describe("tracking category keys", () => {
  const id = "abcdef01-2345-6789-abcd-ef0123456789";

  it("shortId takes the first 8 hex chars, dashless", () => {
    expect(shortId(id)).toBe("abcdef01");
  });

  it("builds stable campaign and step categories", () => {
    expect(campaignCategory(id)).toBe("campaign_abcdef01");
    expect(stepCategory(id, 3)).toBe("seq_abcdef01_s3");
  });
});

describe("sequenceRunBudget (throttle math)", () => {
  const DEFAULT = 40;

  it("falls back to the default budget when no rate is set", () => {
    expect(sequenceRunBudget(null, DEFAULT)).toBe(DEFAULT);
    expect(sequenceRunBudget(undefined, DEFAULT)).toBe(DEFAULT);
    expect(sequenceRunBudget(0, DEFAULT)).toBe(DEFAULT);
    expect(sequenceRunBudget(-5, DEFAULT)).toBe(DEFAULT);
  });

  it("converts an hourly rate into a per-run budget (12 runs/hour)", () => {
    // 20/hour -> ceil(20/12) = 2 per run (~24/hour effective, close enough for warmup).
    expect(sequenceRunBudget(20, DEFAULT)).toBe(2);
    expect(sequenceRunBudget(12, DEFAULT)).toBe(1);
    expect(sequenceRunBudget(240, DEFAULT)).toBe(20);
  });

  it("never drops below 1 for a positive rate", () => {
    expect(sequenceRunBudget(1, DEFAULT)).toBe(1);
    expect(sequenceRunBudget(5, DEFAULT)).toBe(1);
  });
});

describe("marketingRunBudget (system-first hourly headroom)", () => {
  it("returns the full per-run ceiling when the hour is quiet", () => {
    expect(marketingRunBudget(1500, 0, 200)).toBe(200);
    expect(marketingRunBudget(1500, 300, 200)).toBe(200); // headroom 1200 > ceiling
  });

  it("shrinks as more has already been sent this hour", () => {
    // headroom = 1500 - 1400 = 100, below the 200 ceiling.
    expect(marketingRunBudget(1500, 1400, 200)).toBe(100);
  });

  it("clamps to 0 once the hourly ceiling is reached or exceeded", () => {
    expect(marketingRunBudget(1500, 1500, 200)).toBe(0);
    expect(marketingRunBudget(1500, 5000, 200)).toBe(0);
  });

  it("treats a negative/garbage sentLastHour as zero (fail open to the ceiling)", () => {
    expect(marketingRunBudget(1500, -10, 200)).toBe(200);
  });
});

describe("sequenceContactTag (per-sequence contact tag)", () => {
  it("slugifies a sequence name into a seq- prefixed tag", () => {
    expect(sequenceContactTag("Instagram Posse community")).toBe("seq-instagram-posse-community");
    expect(sequenceContactTag("Course follow-up drip!")).toBe("seq-course-follow-up-drip");
    expect(sequenceContactTag("  VIP  ")).toBe("seq-vip");
  });

  it("caps the slug and never leaves a trailing hyphen", () => {
    // 40-char name slugifies, gets cut to 32, and any trailing hyphen is trimmed.
    const tag = sequenceContactTag("a".repeat(30) + "   spillover words here");
    expect(tag.startsWith("seq-")).toBe(true);
    expect(tag.length).toBeLessThanOrEqual(36);
    expect(tag.endsWith("-")).toBe(false);
  });

  it("falls back to seq-drip when the name has no usable characters", () => {
    expect(sequenceContactTag("!!!")).toBe("seq-drip");
    expect(sequenceContactTag("")).toBe("seq-drip");
  });
});

describe("sequencePlatformTags (platform tag from sequence name)", () => {
  it("tags Instagram sequences", () => {
    expect(sequencePlatformTags("Instagram Posse community")).toEqual(["instagram"]);
    expect(sequencePlatformTags("Cold Leads: Instagram (Amazon influencers)")).toEqual(["instagram"]);
  });

  it("tags TikTok sequences (including 'tik tok' spelling)", () => {
    expect(sequencePlatformTags("Cold Leads: TikTok (Amazon influencers)")).toEqual(["tiktok"]);
    expect(sequencePlatformTags("Tik Tok warmup")).toEqual(["tiktok"]);
  });

  it("returns no platform tag for names that name no platform", () => {
    expect(sequencePlatformTags("Course follow-up drip")).toEqual([]);
    expect(sequencePlatformTags("")).toEqual([]);
  });
});

describe("nextSendTime (step due-time math)", () => {
  it("with no fixed hour, sends at enrolled_at + dayOffset days (unchanged behavior)", () => {
    const enrolled = "2026-08-31T14:23:00.000Z";
    expect(iso(nextSendTime(enrolled, 0, null))).toBe("2026-08-31T14:23:00.000Z");
    expect(iso(nextSendTime(enrolled, 3, null))).toBe("2026-09-03T14:23:00.000Z");
    // An out-of-range hour is ignored, same as null.
    expect(iso(nextSendTime(enrolled, 3, 99))).toBe("2026-09-03T14:23:00.000Z");
  });

  it("pins to the given hour on the same day when that hour is still ahead", () => {
    // Enrolled 04:00 MT (10:00Z, summer/MDT); 9am MT that day is 15:00Z, after base.
    expect(iso(nextSendTime("2026-08-31T10:00:00.000Z", 0, 9))).toBe("2026-08-31T15:00:00.000Z");
  });

  it("rolls to the next day when the fixed hour has already passed", () => {
    // Enrolled 14:00 MT (20:00Z); 9am MT today already passed, so it lands the next day.
    expect(iso(nextSendTime("2026-08-31T20:00:00.000Z", 0, 9))).toBe("2026-09-01T15:00:00.000Z");
  });

  it("applies the correct Mountain Time offset across the DST boundary", () => {
    // Summer (MDT, UTC-6): 9am MT resolves to 15:00Z.
    expect(iso(nextSendTime("2026-07-15T00:00:00.000Z", 0, 9))).toBe("2026-07-15T15:00:00.000Z");
    // Winter (MST, UTC-7): 9am MT resolves to 16:00Z.
    expect(iso(nextSendTime("2026-12-15T00:00:00.000Z", 0, 9))).toBe("2026-12-15T16:00:00.000Z");
  });
});
