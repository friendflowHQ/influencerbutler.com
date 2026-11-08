import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_SENDS_PER_ARM,
  MAX_LOOKS,
  POCOCK_ALPHA_4,
  decideExperiment,
  lookDue,
  normalCdf,
  pocockAlpha,
  projectSendsPerArm,
  twoProportionZ,
  type ArmStats,
} from "@/lib/ab-stats";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-12-20T16:00:00Z");
const STARTED = new Date(NOW - 20 * DAY).toISOString();

function arms(
  a: [number, number],
  b: [number, number],
  guard?: { a: [number, number]; b: [number, number] },
): ArmStats[] {
  return [
    {
      arm: "a",
      sent: a[0],
      metrics: {
        click: { n: a[0], x: a[1] },
        paid: guard ? { n: guard.a[0], x: guard.a[1] } : { n: a[0], x: 0 },
        activation: null,
      },
    },
    {
      arm: "b",
      sent: b[0],
      metrics: {
        click: { n: b[0], x: b[1] },
        paid: guard ? { n: guard.b[0], x: guard.b[1] } : { n: b[0], x: 0 },
        activation: null,
      },
    },
  ];
}

describe("normalCdf", () => {
  it("matches known values to 1e-4", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.645)).toBeCloseTo(0.05, 3);
    expect(normalCdf(2.576)).toBeCloseTo(0.995, 4);
  });
});

describe("twoProportionZ", () => {
  it("30/200 vs 50/200 gives z about 2.48 and p about 0.013", () => {
    const r = twoProportionZ(30, 200, 50, 200);
    expect(r.z).toBeCloseTo(2.48, 1);
    expect(r.pValue).toBeGreaterThan(0.011);
    expect(r.pValue).toBeLessThan(0.015);
    expect(r.lift).toBeCloseTo(2 / 3, 5);
  });
  it("is symmetric in sign", () => {
    expect(twoProportionZ(50, 200, 30, 200).z).toBeCloseTo(-twoProportionZ(30, 200, 50, 200).z, 9);
  });
  it("handles empty arms and degenerate pooled rates", () => {
    expect(twoProportionZ(0, 0, 5, 10)).toMatchObject({ z: 0, pValue: 1 });
    expect(twoProportionZ(0, 100, 0, 100)).toMatchObject({ z: 0, pValue: 1 });
    expect(twoProportionZ(100, 100, 100, 100)).toMatchObject({ z: 0, pValue: 1 });
    expect(twoProportionZ(10, 100, 10, 100).pValue).toBeCloseTo(1, 6);
  });
});

describe("pocockAlpha", () => {
  it("is 0.0182 for 4 looks", () => {
    expect(POCOCK_ALPHA_4).toBe(0.0182);
    expect(pocockAlpha(4)).toBe(0.0182);
    expect(pocockAlpha()).toBe(0.0182);
    expect(MAX_LOOKS).toBe(4);
  });
  it("falls back to Bonferroni for unusual schedules", () => {
    expect(pocockAlpha(10)).toBeCloseTo(0.005, 9);
    expect(pocockAlpha(1)).toBe(0.05);
  });
});

describe("decideExperiment", () => {
  const base = {
    primaryMetric: "click" as const,
    guardrail: "paid" as const,
    minSends: DEFAULT_MIN_SENDS_PER_ARM,
    looksDone: 0,
    startedAt: STARTED,
    maxDays: 45,
    now: NOW,
  };

  it("continues below min sends without spending a look", () => {
    const d = decideExperiment({ ...base, arms: arms([150, 10], [220, 60]) });
    expect(d.action).toBe("continue");
    expect(d.lookTaken).toBe(false);
    expect(d.reason).toMatch(/200 matured sends/);
  });

  it("stops inconclusive at max days when min sends never arrived", () => {
    const d = decideExperiment({ ...base, startedAt: new Date(NOW - 46 * DAY).toISOString(), arms: arms([50, 5], [50, 9]) });
    expect(d.action).toBe("stop-no-winner");
    expect(d.outcome).toBe("inconclusive");
  });

  it("applies the look-adjusted alpha: p = 0.03 is not enough", () => {
    // 40/300 vs 60/300: p about 0.03, significant at 0.05 but not at 0.0182.
    const d = decideExperiment({ ...base, arms: arms([300, 40], [300, 60]) });
    expect(d.pValue).toBeGreaterThan(0.0182);
    expect(d.pValue).toBeLessThan(0.05);
    expect(d.action).toBe("continue");
    expect(d.lookTaken).toBe(true);
    expect(d.look).toBe(1);
    expect(d.alpha).toBe(0.0182);
  });

  it("decides the better arm when p < 0.0182", () => {
    const d = decideExperiment({ ...base, arms: arms([400, 40], [400, 80]) });
    expect(d.action).toBe("decide");
    expect(d.winner).toBe("b");
    expect(d.outcome).toBe("promote");
    expect(d.pValue).toBeLessThan(0.0182);
  });

  it("can pick the control as the winner", () => {
    const d = decideExperiment({ ...base, arms: arms([400, 80], [400, 40]) });
    expect(d.action).toBe("decide");
    expect(d.winner).toBe("a");
  });

  it("blocks a click winner that is significantly worse on the guardrail", () => {
    const d = decideExperiment({
      ...base,
      arms: arms([400, 40], [400, 80], { a: [400, 40], b: [400, 15] }),
    });
    expect(d.action).toBe("stop-no-winner");
    expect(d.outcome).toBe("conflict");
    expect(d.candidate).toBe("b");
  });

  it("stops inconclusive on the last look", () => {
    const d = decideExperiment({ ...base, looksDone: 3, arms: arms([400, 40], [400, 44]) });
    expect(d.action).toBe("stop-no-winner");
    expect(d.outcome).toBe("inconclusive");
    expect(d.look).toBe(4);
  });

  it("continues while the primary metric cannot be read", () => {
    const a = arms([400, 40], [400, 80]);
    a[0].metrics.click = null;
    const d = decideExperiment({ ...base, arms: a });
    expect(d.action).toBe("continue");
  });

  it("never produces an em dash in reasons", () => {
    const d = decideExperiment({ ...base, arms: arms([400, 40], [400, 80], { a: [400, 40], b: [400, 15] }) });
    expect(d.reason).not.toMatch(/\u2014/);
  });
});

describe("lookDue and projectSendsPerArm", () => {
  it("is due on first look and after 7 days", () => {
    expect(lookDue(null, NOW)).toBe(true);
    expect(lookDue(new Date(NOW - 6 * DAY).toISOString(), NOW)).toBe(false);
    expect(lookDue(new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe(true);
  });
  it("projects per-arm sends from the recent rate", () => {
    expect(projectSendsPerArm({ recentSends: 140, recentDays: 14, maxDays: 45 })).toBe(225);
    expect(projectSendsPerArm({ recentSends: 14, recentDays: 14, maxDays: 45 })).toBe(22);
    expect(projectSendsPerArm({ recentSends: 10, recentDays: 0, maxDays: 45 })).toBe(0);
  });
});
