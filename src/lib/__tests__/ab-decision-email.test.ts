import { describe, expect, it } from "vitest";
import { AB_ADMIN_URL, buildAbDecisionEmail } from "@/lib/ab-decision-email";
import { FOUNDER_DEFAULT_TO, founderRecipients } from "@/lib/founder-recipient";

describe("buildAbDecisionEmail", () => {
  it("describes a promoted winner with arm stats and the admin link", () => {
    const { subject, text } = buildAbDecisionEmail({
      kind: "decision",
      name: "App trial d3: founder story vs module",
      scope: "App trial, day3 (everyone)",
      primaryMetric: "click",
      guardrailMetric: "activation",
      outcome: "promote",
      winner: "b",
      arms: [
        { arm: "a", label: "control", sent: 410, x: 40, n: 400, guardrailRate: 0.2 },
        { arm: "b", sent: 405, x: 80, n: 400, guardrailRate: 0.21 },
      ],
      pValue: 0.00012,
      z: 3.84,
      alpha: 0.0182,
      look: 2,
      maxLooks: 4,
      whatChanged: "Arm B's copy is now the override for apptrial day3.",
    });
    expect(subject).toBe("A/B winner: arm B for App trial d3: founder story vs module");
    expect(text).toContain("Arm A (control): 410 sent, click rate 10.0% (40/400), activation 20.0%");
    expect(text).toContain("Arm B: 405 sent, click rate 20.0% (80/400)");
    expect(text).toContain("Look 2 of 4");
    expect(text).toContain("needs < 0.0182");
    expect(text).toContain("What changed: Arm B's copy");
    expect(text).toContain(AB_ADMIN_URL);
    expect(text).not.toMatch(/\u2014/);
  });

  it("covers conflict, inconclusive, projection and auto-stop", () => {
    const conflict = buildAbDecisionEmail({
      kind: "decision",
      name: "T",
      scope: "S",
      primaryMetric: "click",
      outcome: "conflict",
    });
    expect(conflict.subject).toBe("A/B test needs your call: T");
    expect(conflict.text).toMatch(/guardrail/);

    const inc = buildAbDecisionEmail({ kind: "decision", name: "T", scope: "S", primaryMetric: "paid" });
    expect(inc.subject).toBe("A/B test inconclusive: T");
    expect(inc.text).toMatch(/control copy stays/);

    const proj = buildAbDecisionEmail({
      kind: "projection",
      name: "T",
      scope: "S",
      primaryMetric: "paid",
      projectedPerArm: 60,
      minSendsPerArm: 200,
      maxDays: 45,
    });
    expect(proj.subject).toBe("A/B test may not finish: T");
    expect(proj.text).toContain("about 60 sends per arm within 45 days");
    expect(proj.text).toContain("needs 200 per arm");

    const stop = buildAbDecisionEmail({
      kind: "auto-stop",
      name: "T",
      scope: "S",
      primaryMetric: "click",
      reason: "The price change took effect.",
    });
    expect(stop.subject).toBe("A/B test stopped: T");
    expect(stop.text).toContain("The price change took effect.");
    for (const t of [conflict.text, inc.text, proj.text, stop.text]) expect(t).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("founderRecipients", () => {
  it("defaults, splits on commas, trims and dedupes", () => {
    expect(founderRecipients(undefined)).toEqual([FOUNDER_DEFAULT_TO]);
    expect(founderRecipients("  ")).toEqual([FOUNDER_DEFAULT_TO]);
    expect(founderRecipients("a@x.com, b@y.com,,A@x.com, junk")).toEqual(["a@x.com", "b@y.com"]);
  });
});
