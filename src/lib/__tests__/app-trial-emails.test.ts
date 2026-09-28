/**
 * Unit tests for the app-trial drip copy.
 * Dependencies: vitest, @/lib/app-trial-emails.
 *
 * These cover the parts of the copy that are load-bearing rather than the
 * prose itself: every tier renders, the trial-ending email only promises a
 * discount when one is configured, and the house copy rules hold.
 */
import { describe, expect, it } from "vitest";
import { APP_TRIAL_COPY, type AppTrialTier, type AppTrialVars } from "@/lib/app-trial-emails";

// Built from its code point so the character itself never appears in this
// repo, which bans it outright.
const EM_DASH = String.fromCharCode(0x2014);

const TIERS: AppTrialTier[] = [
  "day0",
  "day1",
  "day3",
  "day5",
  "day7",
  "day10",
  "day12",
  "day14",
  "day17",
  "day21",
  "day30",
];

function vars(overrides: Partial<AppTrialVars> = {}): AppTrialVars {
  return {
    firstName: "Alex",
    pricingUrl: "https://www.influencerbutler.com/pricing",
    helpUrl: "https://www.influencerbutler.com/help",
    discountCode: null,
    discountPercent: 0,
    ...overrides,
  };
}

function render(tier: AppTrialTier, v: AppTrialVars) {
  const copy = APP_TRIAL_COPY[tier];
  const subject = typeof copy.subject === "function" ? copy.subject(v) : copy.subject;
  return { subject, body: copy.build(v) };
}

describe("APP_TRIAL_COPY", () => {
  it("defines every tier the cron schedules", () => {
    expect(Object.keys(APP_TRIAL_COPY).sort()).toEqual([...TIERS].sort());
  });

  it("renders a non-empty subject and body for every tier", () => {
    for (const tier of TIERS) {
      const { subject, body } = render(tier, vars());
      expect(subject.length, tier).toBeGreaterThan(0);
      expect(body.length, tier).toBeGreaterThan(80);
    }
  });

  it("addresses the recipient by first name", () => {
    for (const tier of TIERS) {
      const { body } = render(tier, vars({ firstName: "Jordan" }));
      expect(body, tier).toContain("Jordan");
    }
  });

  it("never leaves an unresolved template placeholder", () => {
    // The source templates used {{first_name}}; the port interpolates instead.
    for (const tier of TIERS) {
      const { subject, body } = render(tier, vars());
      expect(`${subject}\n${body}`, tier).not.toMatch(/\{\{|\}\}|\$\{/);
    }
  });

  it("keeps the house copy rules: no em-dash, no banned words", () => {
    for (const tier of TIERS) {
      const { subject, body } = render(tier, vars({ discountCode: "SAVE20", discountPercent: 20 }));
      const text = `${subject}\n${body}`;
      expect(text, tier).not.toContain(EM_DASH);
      expect(text.toLowerCase(), tier).not.toContain("genuine");
      expect(text.toLowerCase(), tier).not.toContain("append");
    }
  });

  describe("day14 (the trial-ending ask)", () => {
    it("promises a discount only when one is configured", () => {
      const withCode = render("day14", vars({ discountCode: "SAVE20", discountPercent: 20 })).body;
      expect(withCode).toContain("SAVE20");
      expect(withCode).toContain("20%");

      const without = render("day14", vars()).body;
      expect(without).not.toContain("%");
      expect(without).not.toMatch(/\bcode\b/i);
    });

    it("links the upgrade and reassures about the free-forever butlers", () => {
      const body = render("day14", vars()).body;
      expect(body).toContain("https://www.influencerbutler.com/pricing");
      expect(body).toContain("Like Butler");
      expect(body).toContain("No card, no expiry.");
    });
  });

  it("carries the pricing link in the lapsed tail so a late decision has somewhere to go", () => {
    for (const tier of ["day21", "day30"] as AppTrialTier[]) {
      expect(render(tier, vars()).body, tier).toContain("/pricing");
    }
  });
});
