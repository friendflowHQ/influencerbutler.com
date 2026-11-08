/**
 * Copy lint for every built-in funnel (Funnels v2).
 *
 * Renders EVERY content key of EVERY funnel in SYSTEM_FUNNELS (bare tier, each
 * base, each module, each module x base) with previewVars, plus a "late" pass
 * with the price lock gone and no optional codes or call link, and enforces
 * the house rules:
 *   - no em dash (U+2014); no en dash (U+2013) except between digits (ranges)
 *   - no competitor names: Logie, JoyLink, Keepa, LTK, ShopMy (Benable is a
 *     platform we support, so it is allowed)
 *   - never mention the deal-site importer ("Harvester", "harvest deals")
 *   - no unrendered placeholders ("{{", "${", "undefined", "null" leaking)
 *   - any body that mentions installing or downloading names both Windows and
 *     Mac
 *
 * The competitor list mirrors the memory notes (project-competitor-naming-
 * policy, project-logie-competitor-and-gaps, project-joylink-parity); extend it
 * there and here together.
 *
 * Generic over SYSTEM_FUNNELS so new funnels and other copy files are covered
 * automatically. Every copy module is imported so the track registry is full.
 * Each rule collects every offender, so one run lists them all.
 */
import { describe, expect, it } from "vitest";
import "@/lib/funnel-modules";
import "@/lib/app-trial-emails";
import "@/lib/trial-emails";
import "@/lib/pro-emails";
import "@/lib/free-onboarding-emails";
import "@/lib/winback-emails";
import "@/lib/conversion-emails";
import { SYSTEM_FUNNELS, funnelDefaultsForKey, previewVars } from "@/lib/system-funnels";
import { ALL_MODULE_KEYS, MODULE_KEY_PREFIX, PLAN_BASES } from "@/lib/funnel-types";

// Any other Funnels v2 copy file (for example the upgrade funnel's) registers
// itself on import; pull them in without naming files that may not exist yet.
// (import.meta.glob is a Vite/Vitest compile-time API; the project's tsconfig
// does not load vite/client types, and adding them globally would leak into
// the Next.js app, so the type error is suppressed here only.)
// @ts-expect-error Vite-only API, see above.
import.meta.glob(["../upgrade*.ts", "../*-funnel-copy.ts"], { eager: true });

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const EN_DASH_RANGE = new RegExp(`\\d${EN_DASH}\\d`, "g");
const COMPETITORS = ["Logie", "JoyLink", "Keepa", "LTK", "ShopMy"];
const COMPETITOR_RES = COMPETITORS.map((c) => ({ name: c, re: new RegExp(`\\b${c}\\b`) }));

type Rendered = { funnel: string; key: string; pass: string; subject: string; body: string; sourceKey: string };

function keysFor(step: { tier: string; slot: string; contentKeys: string[] }): string[] {
  const keys = new Set<string>(step.contentKeys);
  keys.add(step.tier);
  for (const b of PLAN_BASES) keys.add(`${step.tier}.${b}`);
  if (step.slot === "module") {
    for (const m of ALL_MODULE_KEYS) {
      keys.add(`${step.tier}.${MODULE_KEY_PREFIX}${m}`);
      for (const b of PLAN_BASES) keys.add(`${step.tier}.${MODULE_KEY_PREFIX}${m}.${b}`);
    }
  }
  return [...keys];
}

// Funnels where a discount code is optional at send time (win-back discount
// and affiliate conversion always carry one).
const OPTIONAL_CODE_FUNNELS = new Set(["trial", "apptrial", "onboarding"]);

function lateVars(funnel: string): Record<string, unknown> {
  const v = { ...previewVars(funnel) };
  for (const k of ["priceLockLine", "bookCallUrl", "goalLine"]) if (k in v) v[k] = "";
  if (OPTIONAL_CODE_FUNNELS.has(funnel)) {
    for (const k of ["monthlyCode", "annualCode", "discountCode"]) if (k in v) v[k] = null;
  }
  return v;
}

function renderAll(): Rendered[] {
  const out: Rendered[] = [];
  for (const f of SYSTEM_FUNNELS) {
    for (const step of f.steps) {
      for (const key of keysFor(step)) {
        for (const [pass, vars] of [
          ["preview", previewVars(f.key)],
          ["late", lateVars(f.key)],
        ] as const) {
          const r = funnelDefaultsForKey(f.key, key, vars);
          out.push({ funnel: f.key, key, pass, subject: r.subject, body: r.body, sourceKey: r.sourceKey });
        }
      }
    }
  }
  return out;
}

const ALL = renderAll();
const WITH_COPY = ALL.filter((r) => r.subject || r.body);

function label(r: Rendered): string {
  return `${r.funnel}:${r.key} (${r.pass}, from ${r.sourceKey || "nothing"})`;
}

/** Every rendered email failing `bad`, deduped by source copy. */
function offenders(rows: Rendered[], bad: (r: Rendered, text: string) => string | null): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const why = bad(r, `${r.subject}\n${r.body}`);
    if (why) out.add(`${r.funnel}:${r.sourceKey || r.key} (${r.pass}): ${why}`);
  }
  return [...out];
}

describe("funnel copy lint", () => {
  it("renders copy for every key of the app trial and trial drips", () => {
    for (const r of ALL.filter((x) => x.funnel === "apptrial" || x.funnel === "trial")) {
      expect(r.subject.length, label(r)).toBeGreaterThan(0);
      expect(r.body.length, label(r)).toBeGreaterThan(80);
    }
    expect(WITH_COPY.length).toBeGreaterThan(100);
  });

  it("has no em dash, and en dashes only in numeric ranges", () => {
    expect(
      offenders(WITH_COPY, (_r, text) => {
        if (text.includes(EM_DASH)) return "em dash";
        if (text.replace(EN_DASH_RANGE, "").includes(EN_DASH)) return "en dash outside a range";
        return null;
      }),
    ).toEqual([]);
  });

  it("never names a competitor or the deal-site importer", () => {
    expect(
      offenders(WITH_COPY, (_r, text) => {
        const hit = COMPETITOR_RES.find((c) => c.re.test(text));
        if (hit) return `names ${hit.name}`;
        if (/harvester/i.test(text)) return "mentions Harvester";
        if (/harvest(ing|s)?\s+(amazon\s+)?deal/i.test(text)) return "mentions harvesting deals";
        if (/deal sites/i.test(text)) return "mentions deal sites";
        return null;
      }),
    ).toEqual([]);
  });

  it("leaves no unrendered placeholder behind", () => {
    expect(
      offenders(WITH_COPY, (_r, text) => {
        if (/\{\{|\}\}|\$\{/.test(text)) return "unrendered placeholder";
        if (/\bundefined\b|\[object Object\]/.test(text)) return "undefined leaked";
        if (/\bnull\b/.test(text)) return "null leaked";
        return null;
      }),
    ).toEqual([]);
  });

  it("covers both Windows and Mac whenever copy mentions installing or downloading", () => {
    expect(
      offenders(WITH_COPY, (r) => {
        if (!/install|download/i.test(r.body)) return null;
        const win = /\bWindows\b/.test(r.body);
        const mac = /\bMac\b|\bmacOS\b/.test(r.body);
        if (win && mac) return null;
        return `mentions install/download without ${win ? "Mac" : mac ? "Windows" : "Windows or Mac"}`;
      }),
    ).toEqual([]);
  });

  it("does not leave triple blank lines when optional lines are empty", () => {
    for (const r of WITH_COPY.filter((x) => x.funnel === "apptrial" || x.funnel === "trial")) {
      expect(r.body, label(r)).not.toMatch(/\n\s*\n\s*\n/);
    }
  });
});
