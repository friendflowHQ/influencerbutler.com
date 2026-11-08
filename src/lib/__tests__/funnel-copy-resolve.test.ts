import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isOverrideActive,
  resolveFunnelCopy,
  resolveFunnelCopyForKey,
  type FunnelOverride,
} from "@/lib/funnel-copy";
import { clearTrackCopy, registerTrackCopy } from "@/lib/funnel-track-registry";
import {
  codeDefaultForExactKey,
  funnelDefaults,
  funnelDefaultsForKey,
  isValidContentKey,
  makeCodeDefaultForKey,
  previewVars,
  SYSTEM_FUNNELS,
} from "@/lib/system-funnels";

function ov(funnel: string, tier: string, patch: Partial<FunnelOverride> = {}): FunnelOverride {
  return {
    funnel,
    tier,
    subject: null,
    body: null,
    applyTag: null,
    dayOffset: null,
    enabled: true,
    updatedAt: null,
    updatedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    ...patch,
  };
}

function overridesOf(...rows: FunnelOverride[]): Map<string, FunnelOverride> {
  return new Map(rows.map((r) => [`${r.funnel}:${r.tier}`, r]));
}

// Fake code defaults: the bare tier plus one tailored key.
const CODE: Record<string, { subject: string; body: string }> = {
  day5: { subject: "bare subject", body: "bare body" },
  "day5.mod-walmart": { subject: "walmart subject", body: "walmart body" },
};
const codeDefaultForKey = (k: string) => CODE[k] ?? null;

describe("resolveFunnelCopyForKey precedence", () => {
  it("a bare-tier override cannot beat a track/module code default", () => {
    const r = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-walmart",
      vars: {},
      overrides: overridesOf(ov("apptrial", "day5", { subject: "OLD bare override", body: "OLD body" })),
      codeDefaultForKey,
    });
    expect(r.subject).toBe("walmart subject");
    expect(r.body).toBe("walmart body");
    expect(r.subjectSource).toBe("code:day5.mod-walmart");
  });

  it("an exact-key override wins over everything", () => {
    const r = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-walmart",
      vars: { firstName: "Sam" },
      overrides: overridesOf(
        ov("apptrial", "day5", { subject: "bare override" }),
        ov("apptrial", "day5.mod-walmart", {
          subject: "Hi {{firstName}}",
          body: "exact body",
          applyTag: "seen-walmart",
        }),
      ),
      codeDefaultForKey,
    });
    expect(r.subject).toBe("Hi Sam");
    expect(r.body).toBe("exact body");
    expect(r.applyTag).toBe("seen-walmart");
    expect(r.subjectSource).toBe("override:day5.mod-walmart");
  });

  it("a key with no tailored copy uses the bare override, then the bare default", () => {
    const withBare = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-social.power",
      vars: {},
      overrides: overridesOf(ov("apptrial", "day5", { subject: "bare override", applyTag: "t1" })),
      codeDefaultForKey,
    });
    expect(withBare.subject).toBe("bare override");
    expect(withBare.body).toBe("bare body");
    expect(withBare.applyTag).toBe("t1");
    expect(withBare.bodySource).toBe("code:day5");

    const none = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-social",
      vars: {},
      overrides: new Map(),
      codeDefaultForKey,
    });
    expect(none.subject).toBe("bare subject");
  });

  it("module copy beats an intermediate base-only override (interleaved walk)", () => {
    const r = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-walmart.power",
      vars: {},
      overrides: overridesOf(ov("apptrial", "day5.power", { subject: "power override" })),
      codeDefaultForKey,
    });
    expect(r.subject).toBe("walmart subject");
  });

  it("disabled and blank (reset) overrides are ignored; fields resolve independently", () => {
    const r = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-walmart",
      vars: {},
      overrides: overridesOf(
        ov("apptrial", "day5.mod-walmart", { subject: "  ", body: "" }),
        ov("apptrial", "day5", { subject: "x", enabled: false }),
      ),
      codeDefaultForKey,
    });
    expect(r.subject).toBe("walmart subject");
    expect(isOverrideActive(ov("f", "t", { subject: "" }))).toBe(false);
    expect(isOverrideActive(ov("f", "t", { subject: "s" }))).toBe(true);
    expect(isOverrideActive(ov("f", "t", { subject: "s", enabled: false }))).toBe(false);

    const partial = resolveFunnelCopyForKey({
      funnel: "apptrial",
      contentKey: "day5.mod-walmart",
      vars: {},
      overrides: overridesOf(ov("apptrial", "day5.mod-walmart", { subject: "only subject" })),
      codeDefaultForKey,
    });
    expect(partial.subject).toBe("only subject");
    expect(partial.body).toBe("walmart body");
  });

  it("matches resolveFunnelCopy for a bare key", () => {
    const overrides = overridesOf(ov("trial", "day3", { body: "custom {{firstName}}", applyTag: "x" }));
    const vars = previewVars("trial");
    const legacy = resolveFunnelCopy({
      funnel: "trial",
      tier: "day3",
      vars,
      defaults: funnelDefaults("trial", "day3", vars),
      overrides,
    });
    const v2 = resolveFunnelCopyForKey({
      funnel: "trial",
      contentKey: "day3",
      vars,
      overrides,
      codeDefaultForKey: makeCodeDefaultForKey("trial", vars),
    });
    expect({ subject: v2.subject, body: v2.body, applyTag: v2.applyTag }).toEqual(legacy);
  });
});

describe("system-funnels content keys + registry", () => {
  // Real copy modules register tailored/module/upgrade copy on import; these
  // cases assert registry behavior from an empty registry.
  beforeEach(() => clearTrackCopy());
  afterEach(() => clearTrackCopy());

  it("funnelDefaultsForKey walks registered track copy then the bare default", () => {
    const vars = previewVars("apptrial");
    const bare = funnelDefaults("apptrial", "day3", vars);
    expect(bare.subject.length).toBeGreaterThan(0);
    expect(funnelDefaultsForKey("apptrial", "day3.mod-walmart.power", vars)).toEqual({ ...bare, sourceKey: "day3" });

    registerTrackCopy("apptrial", {
      "day3.mod-walmart": { subject: (v) => `Walmart for ${String(v.firstName)}`, build: () => "wm body" },
    });
    registerTrackCopy("*", { "*.power": { subject: "any power", build: () => "p" } });
    expect(funnelDefaultsForKey("apptrial", "day3.mod-walmart.power", vars)).toEqual({
      subject: "Walmart for Alex",
      body: "wm body",
      sourceKey: "day3.mod-walmart",
    });
    expect(funnelDefaultsForKey("apptrial", "day0.power", vars).sourceKey).toBe("day0.power");
    expect(codeDefaultForExactKey("apptrial", "day3.mod-deals", vars)).toBeNull();
    expect(codeDefaultForExactKey("apptrial", "day3", vars)).toEqual(bare);
  });

  it("upgrade funnel exists and pulls bare copy from the registry", () => {
    const up = SYSTEM_FUNNELS.find((f) => f.key === "upgrade");
    expect(up?.steps.map((s) => [s.tier, s.defaultDayOffset])).toEqual([
      ["u1", 21],
      ["u2", 35],
    ]);
    expect(funnelDefaults("upgrade", "u1", previewVars("upgrade"))).toEqual({ subject: "", body: "" });
    registerTrackCopy("upgrade", { u1: { subject: "Tools", build: (v) => String(v.toolsLine) } });
    expect(funnelDefaults("upgrade", "u1", previewVars("upgrade")).body).toContain("Walmart Butler");
  });

  it("every step has a slot and its listed content keys are valid", () => {
    for (const f of SYSTEM_FUNNELS) {
      for (const s of f.steps) {
        expect(["base", "module", "urgency"]).toContain(s.slot);
        expect(s.contentKeys[0]).toBe(s.tier);
        for (const k of s.contentKeys) expect(isValidContentKey(f.key, k), `${f.key}:${k}`).toBe(true);
        if (s.slot === "module") expect(s.moduleIndex).toBeDefined();
      }
    }
    expect(isValidContentKey("apptrial", "day0.mod-walmart")).toBe(false); // base slot
    expect(isValidContentKey("apptrial", "day3.mod-youtube.power")).toBe(true);
    expect(isValidContentKey("apptrial", "day99")).toBe(false);
  });

  it("track vars appear in previewVars for tailored funnels and contain no long dashes", () => {
    for (const key of ["trial", "pro", "onboarding", "apptrial", "winback", "conversion"]) {
      const v = previewVars(key);
      for (const name of ["aiLine", "priceLockLine", "price", "beginnerPrice", "eventLine", "goalLine", "bookCallUrl"]) {
        expect(name in v, `${key}.${name}`).toBe(true);
        expect(String(v[name])).not.toMatch(new RegExp("[\\u2013\\u2014]"));
      }
    }
  });
});
