/**
 * Funnels v2 module copy (src/lib/funnel-modules.ts) and the track copy the
 * app-trial and trial drips register.
 */
import { describe, expect, it } from "vitest";
import {
  MODULE_COPY,
  MODULE_COPY_FUNNELS,
  moduleCopyFor,
  moduleTrackCopyMap,
  paragraphs,
  trackVars,
} from "@/lib/funnel-modules";
import { APP_TRIAL_TRACK_COPY, appTrialCodeDefaultForKey, type AppTrialVars } from "@/lib/app-trial-emails";
import { TRIAL_TRACK_COPY, trialCodeDefaultForKey, type TrialVars } from "@/lib/trial-emails";
import { lookupTrackCopy } from "@/lib/funnel-track-registry";
import { MODULE_KEYS } from "@/lib/funnel-types";
import { LEVEL_PRICE_CENTS } from "@/lib/pricing-constants";

const POWER_ONLY = ["Walmart Butler", "Social Posting Butler", "Instagram Butler", "Close Friends Butler", "YouTube Butler", "Earnings Intelligence", "Messenger Butler"];

function render(entry: { subject: unknown; build: (v: Record<string, unknown>) => string }, v: Record<string, unknown>) {
  const subject = typeof entry.subject === "function" ? (entry.subject as (x: unknown) => string)(v) : String(entry.subject);
  return { subject, body: entry.build(v) };
}

const VARS = { firstName: "Jordan" };

describe("MODULE_COPY", () => {
  it("covers every v1 module with shared copy", () => {
    expect(Object.keys(MODULE_COPY).sort()).toEqual([...MODULE_KEYS].sort());
    for (const m of MODULE_KEYS) {
      const { subject, body } = render(MODULE_COPY[m].shared, VARS);
      expect(subject.length, m).toBeGreaterThan(5);
      expect(body, m).toContain("Jordan");
      expect(body, m).toContain("- Liz");
    }
  });

  it("falls back to shared copy for a base without its own entry", () => {
    expect(moduleCopyFor("deals", "beginner")).toBe(MODULE_COPY.deals.shared);
    expect(moduleCopyFor("deals", "power")).toBe(MODULE_COPY.deals.power);
    expect(moduleCopyFor("walmart", null)).toBe(MODULE_COPY.walmart.shared);
  });

  it("never pitches a Power-only butler as part of Beginner", () => {
    for (const m of MODULE_KEYS) {
      const entry = MODULE_COPY[m].beginner;
      if (!entry) continue;
      const body = render(entry, VARS).body;
      for (const name of POWER_ONLY) {
        if (!body.includes(name)) continue;
        // Mentioned only as an upgrade: the sentence must say Power User.
        const sentence = body.split(/(?<=[.!?])\s/).find((s) => s.includes(name)) ?? "";
        const para = body.split("\n\n").find((p) => p.includes(name)) ?? "";
        expect(`${sentence} ${para}`, `${m}: ${name}`).toMatch(/Power User/);
      }
    }
  });

  it("registers wildcard keys for the app trial and trial funnels", () => {
    expect([...MODULE_COPY_FUNNELS]).toEqual(["apptrial", "trial"]);
    const map = moduleTrackCopyMap();
    expect(map["*.mod-walmart"]).toBe(MODULE_COPY.walmart.shared);
    expect(map["*.mod-walmart.power"]).toBe(MODULE_COPY.walmart.power);
    expect(map["*.mod-deals.beginner"]).toBeUndefined();
    expect(lookupTrackCopy("apptrial", "day3.mod-walmart.power")).toBe(MODULE_COPY.walmart.power);
    expect(lookupTrackCopy("trial", "day7.mod-video")).toBe(MODULE_COPY.video.shared);
    // Pro and onboarding frame modules differently; not registered here.
    expect(lookupTrackCopy("onboarding", "day2.mod-video")).toBeNull();
  });
});

describe("trackVars fallbacks", () => {
  it("uses supplied vars and keeps an explicit empty price lock empty", () => {
    const t = trackVars({ aiLine: "AI!", priceLockLine: "", price: "$1/month", bookCallUrl: "https://x" }, "power");
    expect(t.aiLine).toBe("AI!");
    expect(t.priceLockLine).toBe("");
    expect(t.price).toBe("$1/month");
    expect(t.bookCallUrl).toBe("https://x");
  });

  it("derives prices from pricing-constants and never invents a call link", () => {
    const t = trackVars({}, "beginner");
    const cents = LEVEL_PRICE_CENTS.beginner.solo!.monthly;
    expect(t.beginnerPrice).toContain(String(Math.floor(cents / 100)));
    expect(t.aiLine).toMatch(/included/i);
    expect(t.bookCallUrl).toBe("");
    expect(trackVars({}, "power").aiLine).toMatch(/OpenAI/);
  });

  it("paragraphs drops empty blocks without leaving double gaps", () => {
    expect(paragraphs("a", "", null, ["", "b1", "b2"], false, "c")).toBe("a\n\nb1\nb2\n\nc");
  });
});

describe("track copy", () => {
  const appVars: AppTrialVars = {
    firstName: "Jordan",
    pricingUrl: "https://www.influencerbutler.com/pricing",
    helpUrl: "https://www.influencerbutler.com/help",
    discountCode: null,
    discountPercent: 0,
  };
  const trialVars: TrialVars = {
    firstName: "Jordan",
    monthlyCode: null,
    annualCode: null,
    monthlyPercent: 0,
    annualPercent: 0,
    subscriptionUrl: "https://www.influencerbutler.com/dashboard/subscription",
  };

  it("app trial resolves exact keys, modules and bare tiers", () => {
    expect(Object.keys(APP_TRIAL_TRACK_COPY)).toContain("day0.beginner");
    expect(appTrialCodeDefaultForKey("day0.power", appVars)?.subject).toMatch(/One key/);
    expect(appTrialCodeDefaultForKey("day3.mod-walmart", appVars)?.subject).toMatch(/Walmart/);
    expect(appTrialCodeDefaultForKey("day3", appVars)?.subject).toMatch(/agent/);
    expect(appTrialCodeDefaultForKey("day3.power", appVars)).toBeNull();
    expect(appTrialCodeDefaultForKey("not a key!", appVars)).toBeNull();
  });

  it("Beginner app-trial copy says AI is included; Power copy talks about the key", () => {
    expect(appTrialCodeDefaultForKey("day0.beginner", appVars)?.body).toMatch(/AI is included/);
    expect(appTrialCodeDefaultForKey("day0.power", appVars)?.body).toMatch(/OpenAI key/);
    const b14 = appTrialCodeDefaultForKey("day14.beginner", appVars)!.body;
    for (const name of POWER_ONLY) expect(b14).not.toContain(name);
  });

  it("only shows a 1:1 call link when the send path supplies one", () => {
    expect(appTrialCodeDefaultForKey("day0.power", appVars)?.body).not.toMatch(/Book one here/);
    const withCall = appTrialCodeDefaultForKey("day0.power", { ...appVars, bookCallUrl: "https://www.influencerbutler.com/dashboard/book" });
    expect(withCall?.body).toContain("/dashboard/book");
    expect(trialCodeDefaultForKey("day0.power", trialVars)?.subject).not.toMatch(/1:1/);
    expect(trialCodeDefaultForKey("day0.power", { ...trialVars, bookCallUrl: "https://x/book" })?.subject).toMatch(/1:1/);
  });

  it("price lock line appears while supplied and vanishes when empty", () => {
    const lock = "Prices go up soon. Start now and keep today's price.";
    expect(appTrialCodeDefaultForKey("day12", { ...appVars, priceLockLine: lock })?.body).toContain(lock);
    const after = appTrialCodeDefaultForKey("day12", { ...appVars, priceLockLine: "" })!;
    expect(after.subject).toMatch(/wraps in 2 days/);
    expect(after.body).not.toMatch(/\n\n\n/);
  });

  it("trial track copy covers Beginner and Power day0", () => {
    expect(Object.keys(TRIAL_TRACK_COPY).sort()).toEqual(["day0.beginner", "day0.power"]);
    const b = trialCodeDefaultForKey("day0.beginner", trialVars)!.body;
    expect(b).toMatch(/Windows/);
    expect(b).toMatch(/Mac/);
    expect(b).not.toMatch(/50\+ butlers unlocked/);
  });
});
