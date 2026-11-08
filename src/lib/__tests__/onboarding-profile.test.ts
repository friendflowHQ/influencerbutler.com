/**
 * Summary: onboarding-profile parses walkthrough answers against the strict
 *   whitelist, maps them to managed wt-* tags that the contact tag rules accept
 *   (normalizeTag, no A/B variant suffix), replaces managed tags on update
 *   without touching others, merges a late capture without wiping completion
 *   fields, and degrades when the profile columns are missing.
 * Dependencies: vitest, @/lib/onboarding-profile, @/lib/email-audience,
 *   @/lib/funnel-types, ./funnels-v2-fake-db.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyOnboardingProfile,
  mergeOnboardingProfile,
  parseOnboardingProfile,
  profileFromTags,
  profileTags,
  replaceManagedTags,
} from "@/lib/onboarding-profile";
import { normalizeTag } from "@/lib/email-audience";
import { ONBOARDING_VOCAB, type OnboardingProfile } from "@/lib/funnel-types";
import { makeFakeDb } from "./funnels-v2-fake-db";

const VARIANT_TAG_RE = /^(.+)-[a-z]$/;

const FULL = {
  v: 1,
  stage: "complete",
  experience: "existing",
  creatorMode: "both",
  goal: "cc-auto-accept",
  platforms: ["amazon", "walmart", "amazon", "myspace"],
  mode: "automation",
  marketplaces: ["us", "uk"],
  dealsPostingMode: "auto",
  outcome: "complete",
  extra: "ignored",
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parseOnboardingProfile", () => {
  it("keeps whitelisted values, dedupes arrays and drops unknowns", () => {
    const p = parseOnboardingProfile(FULL)!;
    expect(p).toEqual({
      v: 1,
      stage: "complete",
      experience: "existing",
      creatorMode: "both",
      goal: "cc-auto-accept",
      platforms: ["amazon", "walmart"],
      mode: "automation",
      marketplaces: ["us", "uk"],
      dealsPostingMode: "auto",
      outcome: "complete",
    });
    expect(p).not.toHaveProperty("extra");
  });

  it("normalizes case and whitespace", () => {
    expect(parseOnboardingProfile({ goal: " Video-Marketplaces " })?.goal).toBe("video-marketplaces");
  });

  it("returns null when nothing valid is present", () => {
    expect(parseOnboardingProfile(null)).toBeNull();
    expect(parseOnboardingProfile("x")).toBeNull();
    expect(parseOnboardingProfile([])).toBeNull();
    expect(parseOnboardingProfile({ stage: "complete" })).toBeNull();
    expect(parseOnboardingProfile({ goal: "get-rich", platforms: ["myspace"] })).toBeNull();
  });

  it("uses the stage hint when the profile has no valid stage", () => {
    expect(parseOnboardingProfile({ goal: "everything" }, "backfill")?.stage).toBe("backfill");
    expect(parseOnboardingProfile({ goal: "everything", stage: "bogus" })?.stage).toBe("capture");
  });
});

describe("profileTags", () => {
  it("maps every field to a wt-* tag", () => {
    const tags = profileTags(parseOnboardingProfile(FULL));
    expect(tags).toEqual([
      "wt-exp-existing",
      "wt-mode-both",
      "wt-goal-cc-auto-accept",
      "wt-run-automation",
      "wt-deals-auto",
      "wt-done-complete",
      "wt-plat-amazon",
      "wt-plat-walmart",
      "wt-mkt-intl",
    ]);
  });

  it("sets wt-mkt-intl only for a non-us marketplace", () => {
    expect(profileTags(parseOnboardingProfile({ marketplaces: ["us"] }))).toEqual([]);
    expect(profileTags(parseOnboardingProfile({ marketplaces: ["de"] }))).toEqual(["wt-mkt-intl"]);
  });

  it("every possible tag passes normalizeTag unchanged and is not an A/B variant tag", () => {
    const maxProfile: Record<string, unknown> = { stage: "complete" };
    const all = new Set<string>();
    for (const [field, values] of Object.entries(ONBOARDING_VOCAB)) {
      for (const v of values) {
        const p = parseOnboardingProfile({ ...maxProfile, [field]: field === "platforms" || field === "marketplaces" ? [v] : v });
        for (const t of profileTags(p)) all.add(t);
      }
    }
    expect(all.size).toBeGreaterThan(20);
    for (const t of all) {
      expect(normalizeTag(t), t).toBe(t);
      expect(t.length).toBeLessThanOrEqual(40);
      expect(VARIANT_TAG_RE.test(t), t).toBe(false);
    }
  });
});

describe("profileFromTags", () => {
  it("round-trips everything except marketplaces", () => {
    const p = parseOnboardingProfile(FULL)!;
    const back = profileFromTags(profileTags(p))!;
    const { marketplaces: _m, ...rest } = p;
    expect(back).toEqual(rest);
  });

  it("returns null with no wt tags", () => {
    expect(profileFromTags(["newsletter"])).toBeNull();
    expect(profileFromTags([])).toBeNull();
  });
});

describe("replaceManagedTags", () => {
  it("drops only the given prefixes and keeps other tags in order", () => {
    expect(
      replaceManagedTags(["vip", "wt-goal-everything", "plan-power", "ext-review-nudge"], ["wt-goal-cc-auto-accept"], ["wt-"]),
    ).toEqual(["vip", "plan-power", "ext-review-nudge", "wt-goal-cc-auto-accept"]);
  });
});

describe("mergeOnboardingProfile", () => {
  const stored = parseOnboardingProfile(FULL)!;

  it("a completion replaces everything", () => {
    const incoming = parseOnboardingProfile({ goal: "everything", stage: "complete" })!;
    const r = mergeOnboardingProfile(stored, incoming);
    expect(r.profile).toEqual(incoming);
    expect(r.replacePrefixes).toEqual(["wt-"]);
  });

  it("a late capture only replaces the fields it carries", () => {
    const incoming = parseOnboardingProfile({ goal: "everything", platforms: ["youtube"] }, "capture")!;
    const r = mergeOnboardingProfile(stored, incoming);
    expect(r.profile.goal).toBe("everything");
    expect(r.profile.platforms).toEqual(["youtube"]);
    expect(r.profile.mode).toBe("automation");
    expect(r.profile.outcome).toBe("complete");
    expect(r.profile.stage).toBe("complete");
    expect(r.replacePrefixes.sort()).toEqual(["wt-goal-", "wt-plat-"]);
  });
});

describe("applyOnboardingProfile", () => {
  it("replaces wt tags, keeps others, and writes the profile columns", async () => {
    const fake = makeFakeDb({
      tables: {
        email_subscribers: [{ email: "a@b.co", tags: ["vip", "wt-goal-everything", "plan-beginner"], onboarding_profile: null }],
      },
    });
    const res = await applyOnboardingProfile(fake.db, " A@B.co ", parseOnboardingProfile(FULL)!, {
      now: new Date("2026-11-09T00:00:00Z"),
    });
    expect(res).toMatchObject({ ok: true, tagsChanged: true, columnsWritten: true });
    const row = fake.tables.email_subscribers[0];
    expect(row.tags).toEqual(["vip", "plan-beginner", ...profileTags(parseOnboardingProfile(FULL))]);
    expect(row.onboarding_profile_stage).toBe("complete");
    expect(row.onboarding_profile_at).toBe("2026-11-09T00:00:00.000Z");
    expect((row.onboarding_profile as OnboardingProfile).goal).toBe("cc-auto-accept");
    // Never touches sequence enrollment.
    expect(fake.calls.some((c) => c.table.startsWith("email_sequence"))).toBe(false);
  });

  it("is a no-op when there is no contact row", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [] } });
    const res = await applyOnboardingProfile(fake.db, "x@y.co", parseOnboardingProfile(FULL)!);
    expect(res).toMatchObject({ ok: true, reason: "no-contact" });
    expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("still writes tags when the profile columns are missing", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: ["wt-run-automation"] }] },
      missingColumns: { email_subscribers: ["onboarding_profile", "onboarding_profile_stage", "onboarding_profile_at"] },
    });
    // A capture after a completion: the run-mode tag (from tags) must survive.
    const res = await applyOnboardingProfile(fake.db, "a@b.co", parseOnboardingProfile({ goal: "everything" }, "capture")!);
    expect(res).toMatchObject({ ok: true, tagsChanged: true, columnsWritten: false });
    expect(fake.tables.email_subscribers[0].tags).toEqual(["wt-run-automation", "wt-goal-everything"]);
  });

  it("does not rewrite tags that did not change", async () => {
    const tags = profileTags(parseOnboardingProfile(FULL));
    const fake = makeFakeDb({ tables: { email_subscribers: [{ email: "a@b.co", tags, onboarding_profile: null }] } });
    const res = await applyOnboardingProfile(fake.db, "a@b.co", parseOnboardingProfile(FULL)!);
    expect(res.tagsChanged).toBe(false);
    expect(fake.calls.filter((c) => c.op === "update" && (c.payload as Record<string, unknown>).tags)).toEqual([]);
  });
});
