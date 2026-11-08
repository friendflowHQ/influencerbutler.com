import { describe, expect, it } from "vitest";

import {
  armRate,
  confidenceLabel,
  contentKeyLabel,
  defaultPrimaryMetric,
  experimentStatusLabel,
  formatShortDate,
  goalBarView,
  lookLabel,
  parseTargetInput,
  segmentForKey,
  stalenessOf,
  updatedBadgeText,
  validateArmB,
} from "@/app/dashboard/admin/emails/funnel-admin-format";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("staleness", () => {
  it("buckets at 30 and 60 days", () => {
    expect(stalenessOf(daysAgo(0), NOW)).toBe("fresh");
    expect(stalenessOf(daysAgo(30), NOW)).toBe("fresh");
    expect(stalenessOf(daysAgo(31), NOW)).toBe("amber");
    expect(stalenessOf(daysAgo(60), NOW)).toBe("amber");
    expect(stalenessOf(daysAgo(61), NOW)).toBe("red");
  });
  it("treats a missing or bad date as red", () => {
    expect(stalenessOf(null, NOW)).toBe("red");
    expect(stalenessOf("not a date", NOW)).toBe("red");
  });
});

describe("updated badge text", () => {
  it("formats a code date without slipping a day", () => {
    expect(formatShortDate("2026-11-08")).toBe("Nov 8, 2026");
  });
  it("says who and adds Needs review when stale", () => {
    expect(updatedBadgeText("2026-11-08T03:00:00Z", "eliza", "fresh")).toBe(
      "Updated Nov 8, 2026 by eliza",
    );
    expect(updatedBadgeText("2026-09-01", "code default", "amber")).toBe(
      "Updated Sep 1, 2026 by code default - Needs review",
    );
    expect(updatedBadgeText(null, null, "red")).toBe("No update date - Needs review");
    expect(updatedBadgeText("2026-11-08", "x", "fresh", { showBy: false })).toBe("Updated Nov 8, 2026");
  });
});

describe("goal bars", () => {
  it("renders the spec text", () => {
    const v = goalBarView("Activation", { num: 17, den: 50, rate: 0.34, target: 0.8, measurable: true });
    expect(v.kind).toBe("value");
    expect(v.text).toBe("Activation 34% of 80% goal (17/50)");
    if (v.kind === "value") {
      expect(v.valuePct).toBe(34);
      expect(v.meetsTarget).toBe(false);
    }
  });
  it("handles unmeasurable, missing and empty blocks", () => {
    expect(goalBarView("Activation", { num: 0, den: 10, rate: null, target: 0.8, measurable: false }).text).toBe(
      "Activation: not measurable yet",
    );
    expect(goalBarView("Paid", undefined).kind).toBe("nodata");
    expect(goalBarView("Paid", { num: 0, den: 0, rate: null, target: 0.5 }).text).toBe(
      "Paid: no data yet (goal 50%)",
    );
  });
  it("derives rate from num/den and defaults the target", () => {
    const v = goalBarView("Paid", { num: 9, den: 10 });
    expect(v.text).toBe("Paid 90% of 80% goal (9/10)");
    expect(v.kind === "value" && v.meetsTarget).toBe(true);
  });
  it("parses goal input as percent or fraction", () => {
    expect(parseTargetInput("80")).toBe(0.8);
    expect(parseTargetInput("80%")).toBe(0.8);
    expect(parseTargetInput("0.25")).toBe(0.25);
    expect(parseTargetInput("100")).toBe(1);
    expect(parseTargetInput("0")).toBeNull();
    expect(parseTargetInput("150")).toBeNull();
    expect(parseTargetInput("abc")).toBeNull();
    expect(parseTargetInput("")).toBeNull();
  });
});

describe("content key labels and segments", () => {
  it("labels tabs", () => {
    expect(contentKeyLabel("day3")).toBe("Base");
    expect(contentKeyLabel("day3.beginner")).toBe("Beginner");
    expect(contentKeyLabel("day3.mod-walmart")).toBe("Walmart module");
    expect(contentKeyLabel("day3.mod-cc-auto.power")).toBe("CC auto-accept module (Power)");
  });
  it("maps keys to experiment segments", () => {
    expect(segmentForKey("day3")).toBeNull();
    expect(segmentForKey("day3.beginner")).toBe("beginner");
    expect(segmentForKey("day3.mod-walmart.power")).toBe("mod-walmart.power");
  });
});

describe("experiments", () => {
  it("picks click early and paid later", () => {
    expect(defaultPrimaryMetric(0)).toBe("click");
    expect(defaultPrimaryMetric(5)).toBe("click");
    expect(defaultPrimaryMetric(14)).toBe("paid");
    expect(defaultPrimaryMetric(undefined)).toBe("click");
  });
  it("computes arm rates with fallbacks", () => {
    expect(armRate({ arm: "a", sends: 200, clicks: 20 }, "click")).toBe(0.1);
    expect(armRate({ arm: "a", sends: 200, conversions: 4, conversionRate: 0.02 }, "paid")).toBe(0.02);
    expect(armRate({ arm: "b", sends: 0 }, "paid")).toBeNull();
  });
  it("formats confidence and looks", () => {
    expect(confidenceLabel({ p: 0.031 })).toBe("p = 0.031 (97% confidence)");
    expect(confidenceLabel({ p: 0.0004 })).toBe("p < 0.001 (99.9% confidence)");
    expect(confidenceLabel(null)).toBeNull();
    expect(lookLabel(2)).toBe("Look 2 of 4");
    expect(lookLabel(undefined)).toBe("Look 0 of 4");
    expect(lookLabel(9)).toBe("Look 4 of 4");
  });
  it("labels decided tests with and without a winner", () => {
    expect(experimentStatusLabel({ id: "1", status: "decided", winnerArm: "b" })).toBe("Decided: arm B won");
    expect(
      experimentStatusLabel({ id: "1", status: "decided", winnerArm: null, decision: { outcome: "conflict" } }),
    ).toBe("Decided: no winner (guardrail conflict)");
    expect(experimentStatusLabel({ id: "1", status: "decided" })).toBe("Decided: no winner (inconclusive)");
    expect(experimentStatusLabel({ id: "1" })).toBe("Draft");
  });
  it("validates arm B copy", () => {
    expect(validateArmB("", "x")).toMatch(/subject and a body/);
    expect(validateArmB("Hi", `a ${String.fromCharCode(0x2014)} b`)).toMatch(/em dash/);
    expect(validateArmB("Hi", "Lock it in {{priceLockLine}}")).toMatch(/price-lock/);
    expect(validateArmB("Prices change Nov 29", "body")).toMatch(/price-lock/);
    expect(validateArmB("Hi", "Ends 2026-11-29")).toMatch(/literal date/);
    expect(validateArmB("Hi {{firstName}}", "Try the Walmart Butler.")).toBeNull();
  });
});
