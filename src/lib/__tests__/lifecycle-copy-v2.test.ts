/**
 * Funnels v2 copy for Pro welcome, Free onboarding, Win-back and Affiliate
 * conversion: the load-bearing claims (not the prose). Prices come from
 * pricing-constants or track vars, install copy covers Windows and Mac, the
 * Beginner / Power User day0 + day2 keys are registered, every win-back step
 * mentions pausing, affiliate terms say 12 months, and nothing stale survives
 * ("Deals Butler", "every automation tool", "power users", Windows-only).
 */
import { describe, expect, it } from "vitest";
import {
  PRO_COPY,
  PRO_TRACK_COPY,
  defaultLifecycleTrackVars,
  planPriceLabel,
  proVarsFor,
  type ProTier,
} from "@/lib/pro-emails";
import { ONBOARDING_COPY, onboardingVarsFor, type OnboardingTier } from "@/lib/free-onboarding-emails";
import { WINBACK_COPY, winbackVarsFor, type WinbackSegment, type WinbackTier } from "@/lib/winback-emails";
import { buildConversionBody, conversionSubject, type ConversionTier } from "@/lib/conversion-emails";
import { buildRecurringBody, recurringSoloMonthly } from "@/lib/recurring-campaign";
import { WELCOME_COPY } from "@/lib/welcome-copy";
import { lookupTrackCopy } from "@/lib/funnel-track-registry";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE } from "@/lib/pricing-constants";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const RANGE_RE = new RegExp(`\\d${EN_DASH}\\d`, "g");
const BEFORE = Date.parse("2026-11-08T12:00:00Z");
const AFTER = Date.parse(PRICE_CHANGE.effectiveAt) + 86_400_000;

function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function lint(text: string): string | null {
  if (text.includes(EM_DASH)) return "em dash";
  if (text.split(EN_DASH).length - 1 > (text.match(RANGE_RE) ?? []).length) return "en dash";
  if (/\{\{|\$\{|undefined|\bnull\b/.test(text)) return "placeholder leaked";
  if (/harvest/i.test(text)) return "harvest";
  if (/Deals Butler\b/.test(text) && !/Deals Influencer Butler/.test(text)) return "old Deals Butler name";
  if (/every automation tool|power users/i.test(text)) return "stale plan wording";
  if (/install|download/i.test(text) && !(/Windows/.test(text) && /Mac/.test(text))) return "install without both OSes";
  return null;
}

const proVars = proVarsFor({
  name: "Alex Doe",
  planName: "Beginner Solo",
  subscriptionUrl: "https://www.influencerbutler.com/dashboard/subscription",
});

describe("Pro welcome", () => {
  const tiers: ProTier[] = ["day0", "day2", "day5", "day10"];

  it("renders every bare tier and track key cleanly", () => {
    for (const t of tiers) expect(lint(`${PRO_COPY[t].subject}\n${PRO_COPY[t].build(proVars)}`), t).toBeNull();
    for (const [key, entry] of Object.entries(PRO_TRACK_COPY)) {
      const subject = typeof entry.subject === "function" ? entry.subject(proVars) : entry.subject;
      expect(lint(`${subject}\n${entry.build(proVars as never)}`), key).toBeNull();
    }
  });

  it("registers separate Beginner and Power User copy for day0 and day2", () => {
    for (const key of ["day0.beginner", "day0.power", "day2.beginner", "day2.power"]) {
      expect(lookupTrackCopy("pro", key), key).not.toBeNull();
    }
    const b = String(lookupTrackCopy("pro", "day0.beginner")!.build({ firstName: "A" }));
    const p = String(lookupTrackCopy("pro", "day0.power")!.build({ firstName: "A" }));
    expect(b).toMatch(/150 AI actions/);
    expect(b).not.toMatch(/OpenAI key/);
    expect(p).toMatch(/OpenAI key/);
    expect(p).toContain("/dashboard/book");
    expect(b).toMatch(/On Windows/);
    expect(b).toMatch(/On Mac/);
  });

  it("day10 has the 12-month referral terms and the pause note", () => {
    const body = PRO_COPY.day10.build(proVars);
    expect(body).toMatch(/30%/);
    expect(body).toMatch(/12 months/);
    expect(body).toMatch(/pause/i);
    expect(body).not.toMatch(/lifetime|as long as/i);
  });
});

describe("Free onboarding", () => {
  const payload = {
    tier: "day0" as OnboardingTier,
    to: "a@b.com",
    name: "Alex",
    pricingUrl: "https://www.influencerbutler.com/pricing",
    helpUrl: "https://www.influencerbutler.com/help",
    extensionUrl: "https://www.influencerbutler.com/extension/get",
  };

  it("renders every tier cleanly, with and without a discount", () => {
    for (const discountCode of [null, "SAVE20"]) {
      const v = onboardingVarsFor({ ...payload, discountCode, discountPercent: discountCode ? 20 : 0 });
      for (const t of Object.keys(ONBOARDING_COPY) as OnboardingTier[]) {
        const c = ONBOARDING_COPY[t];
        const subject = typeof c.subject === "function" ? c.subject(v) : c.subject;
        expect(lint(`${subject}\n${c.build(v)}`), `${t} ${discountCode}`).toBeNull();
      }
    }
  });

  it("day0 is the Windows + Mac guide and day10 offers both plans free for 14 days", () => {
    const v = onboardingVarsFor(payload);
    expect(ONBOARDING_COPY.day0.subject).toMatch(/Windows and Mac/);
    expect(ONBOARDING_COPY.day0.build(v)).toMatch(/On Windows[\s\S]*On Mac/);
    const subject = ONBOARDING_COPY.day10.subject;
    expect(typeof subject === "function" ? subject(v) : subject).toBe("Try Beginner or Power User free for 14 days");
    const body = ONBOARDING_COPY.day10.build(v);
    expect(body).toContain(planPriceLabel("beginner", Date.now()));
    expect(body).toContain(planPriceLabel("power", Date.now()));
  });

  it("prices follow the track vars, not literals", () => {
    const v = onboardingVarsFor({ ...payload, trackVars: { beginnerPrice: "$1/month", price: "$2/month" } });
    const body = ONBOARDING_COPY.day10.build(v);
    expect(body).toContain("$1/month");
    expect(body).toContain("$2/month");
  });
});

describe("Win-back", () => {
  const segments: WinbackSegment[] = ["comp", "discount"];
  const tiers: WinbackTier[] = ["t1", "t2", "t3"];
  function vars(reason: string | null) {
    return winbackVarsFor({
      segment: "comp",
      tier: "t1",
      to: "a@b.com",
      name: "Alex",
      reason,
      claimUrl: "https://www.influencerbutler.com/api/winback/claim?id=1&t=x",
      discountCode: "COMEBACK40",
      discountPercent: 40,
    });
  }

  it("every step renders cleanly and mentions pausing", () => {
    for (const reason of [null, "technical_issues"]) {
      const v = vars(reason);
      for (const s of segments) {
        for (const t of tiers) {
          const c = WINBACK_COPY[s][t];
          const subject = typeof c.subject === "function" ? c.subject(v) : c.subject;
          const body = c.build(v);
          expect(lint(`${subject}\n${body}`), `${s} ${t}`).toBeNull();
          expect(body, `${s} ${t}`).toMatch(/pause/i);
        }
      }
    }
  });

  it("comp t1 is the concrete 'what we fixed' list", () => {
    const body = WINBACK_COPY.comp.t1.build(vars(null));
    expect(WINBACK_COPY.comp.t1.subject).toBe("What we fixed since you left");
    expect(body).toMatch(/walkthrough/);
    expect(body).toMatch(/Beginner plan from \$/);
    expect(body).toMatch(/Walmart and Target/);
    expect(body).toMatch(/group call/i);
  });

  it("only offers the free setup call to the technical-issues crowd", () => {
    expect(WINBACK_COPY.comp.t1.build(vars(null))).not.toContain("/dashboard/book");
    const tech = WINBACK_COPY.comp.t1.build(vars("technical_issues"));
    expect(tech).toContain("/dashboard/book");
    expect(tech).toMatch(/free 2-hour setup call/);
  });

  it("discount t1 leads with the Beginner price from the track vars", () => {
    const v = vars(null);
    const subject = WINBACK_COPY.discount.t1.subject;
    const s = typeof subject === "function" ? subject(v) : subject;
    expect(s).toBe(`A cheaper way back: Beginner from ${v.beginnerPrice}`);
    const custom = { ...v, beginnerPrice: "$9/month" };
    expect(typeof subject === "function" ? subject(custom) : subject).toContain("$9/month");
  });
});

describe("Affiliate conversion", () => {
  const tiers: ConversionTier[] = ["1h", "3d", "5d"];

  it("keeps the 20/30/50 offers and the 12-month terms", () => {
    expect(conversionSubject("1h")).toMatch(/20%/);
    expect(conversionSubject("3d")).toMatch(/30%/);
    expect(conversionSubject("5d")).toMatch(/50%/);
    for (const t of tiers) {
      const body = buildConversionBody(t, "Alex", "CODE1", "https://www.influencerbutler.com/pricing?code=CODE1");
      expect(lint(`${conversionSubject(t)}\n${body}`), t).toBeNull();
      expect(body).toContain("CODE1");
      expect(body).toMatch(/Beginner/);
    }
    expect(buildConversionBody("1h", "A", "C", "u")).toMatch(/first 12 months/);
  });

  it("day 3 is the plan-picker cheat sheet with prices from vars", () => {
    const body = buildConversionBody("3d", "A", "C", "u", { beginnerPrice: "$7/month", price: "$8/month" });
    expect(body).toMatch(/Free:/);
    expect(body).toContain("Beginner (from $7/month)");
    expect(body).toContain("Power User (from $8/month)");
  });
});

describe("price helpers and stale one-offs", () => {
  it("planPriceLabel uses today's price, then the announced one", () => {
    expect(planPriceLabel("beginner", BEFORE)).toBe(`${dollars(LEVEL_PRICE_CENTS.beginner.solo!.monthly)}/month`);
    expect(planPriceLabel("power", AFTER)).toBe(`${dollars(PRICE_CHANGE.prices.power.solo!.monthly)}/month`);
    expect(defaultLifecycleTrackVars(AFTER).priceLockLine).toBe("");
    expect(defaultLifecycleTrackVars(BEFORE).priceLockLine).toMatch(/keep today's price/);
    expect(defaultLifecycleTrackVars(BEFORE).bookCallUrl).toBe("");
  });

  it("recurring campaign quotes both plans from constants", () => {
    const before = buildRecurringBody("x", true, new Date(BEFORE));
    expect(before).toContain(`${recurringSoloMonthly("beginner", new Date(BEFORE))}/month on Beginner`);
    expect(before).toContain(`${dollars(LEVEL_PRICE_CENTS.power.solo!.monthly)}/month for every butler`);
    const after = buildRecurringBody("x", false, new Date(AFTER));
    expect(after).toContain(`${dollars(PRICE_CHANGE.prices.power.solo!.monthly)}/month for every butler`);
  });

  it("welcome trial step no longer hard-codes discount percents", () => {
    const text = JSON.stringify(WELCOME_COPY.trial);
    expect(text).not.toMatch(/20%|30%/);
    expect(text).not.toContain(EM_DASH);
  });
});
