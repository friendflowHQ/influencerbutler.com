// Guards COPY_UPDATED_AT: recomputes a fingerprint of every built-in funnel
// content key's code-default copy and fails when it no longer matches the
// recorded one, i.e. copy changed but `node scripts/stamp-funnel-copy.mjs`
// was not run to bump its date.
//
// Stamp mode: with FUNNEL_COPY_STAMP_OUT=<path> set (the stamp script does
// this), the suite writes the current fingerprints to that JSON file and
// skips the assertions.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  COPY_FINGERPRINT_CLOCK,
  COPY_FINGERPRINTS,
  COPY_UPDATED_AT,
  copyUpdatedFor,
  newestCopyDateForFunnel,
} from "@/lib/funnel-copy-dates";
import { MODULE_KEYS, PLAN_BASES } from "@/lib/funnel-types";

const STAMP_OUT = process.env.FUNNEL_COPY_STAMP_OUT || "";
const REAL_NOW = Date.now();

type SystemFunnelsModule = typeof import("@/lib/system-funnels");

/** sha1 of subject + body, first 10 hex chars. */
function fingerprint(subject: string, body: string): string {
  return createHash("sha1").update(`${subject}\n\n${body}`, "utf8").digest("hex").slice(0, 10);
}

/** Every key a step can render: its listed tabs, each base, and for module
 * slots each module and module x base. Only keys with their OWN code copy
 * are fingerprinted (a key that falls back shares its fallback's date). */
function candidateKeys(step: { tier: string; slot: string; contentKeys: string[] }): string[] {
  const keys = new Set<string>(step.contentKeys);
  keys.add(step.tier);
  for (const b of PLAN_BASES) keys.add(`${step.tier}.${b}`);
  if (step.slot === "module") {
    for (const m of MODULE_KEYS) {
      keys.add(`${step.tier}.mod-${m}`);
      for (const b of PLAN_BASES) keys.add(`${step.tier}.mod-${m}.${b}`);
    }
  }
  return [...keys];
}

/** Copy files register tailored copy at import time. Import every src/lib
 * module that calls registerTrackCopy so the fingerprints see all of it, even
 * before system-funnels imports them itself. */
async function importTrackCopyModules(): Promise<void> {
  const libDir = path.resolve(__dirname, "..");
  for (const name of fs.readdirSync(libDir)) {
    if (!/\.ts$/.test(name) || name === "funnel-track-registry.ts") continue;
    const abs = path.join(libDir, name);
    let src = "";
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!src.includes("registerTrackCopy(")) continue;
    await import(/* @vite-ignore */ abs);
  }
}

let current: Record<string, string> = {};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(COPY_FINGERPRINT_CLOCK));
  await importTrackCopyModules();
  const sf: SystemFunnelsModule = await import("@/lib/system-funnels");
  const out: Record<string, string> = {};
  for (const f of sf.SYSTEM_FUNNELS) {
    const vars = sf.previewVars(f.key);
    for (const step of f.steps) {
      for (const key of candidateKeys(step)) {
        const copy = sf.codeDefaultForExactKey(f.key, key, vars);
        if (!copy) continue;
        out[`${f.key}:${key}`] = fingerprint(copy.subject, copy.body);
      }
    }
  }
  current = out;
  vi.useRealTimers();
  if (STAMP_OUT) {
    fs.writeFileSync(STAMP_OUT, JSON.stringify({ fingerprints: current }, null, 2), "utf8");
  }
});

afterAll(() => {
  vi.useRealTimers();
});

const HINT = "Funnel copy changed: run `node scripts/stamp-funnel-copy.mjs` to bump COPY_UPDATED_AT.";

describe.skipIf(Boolean(STAMP_OUT))("funnel copy dates", () => {
  it("fingerprints every built-in step that has code copy", () => {
    expect(Object.keys(current).length).toBeGreaterThan(20);
    // Every bare tier of the six original funnels has hard-coded copy.
    expect(current["trial:day0"]).toBeDefined();
    expect(current["apptrial:day30"]).toBeDefined();
    expect(current["winback:discount_t3"]).toBeDefined();
    expect(current["conversion:5d"]).toBeDefined();
  });

  it("recorded fingerprints match the current copy", () => {
    const changed = Object.keys(current).filter((k) => COPY_FINGERPRINTS[k] !== current[k]);
    const removed = Object.keys(COPY_FINGERPRINTS).filter((k) => !(k in current));
    expect({ changed, removed, hint: changed.length || removed.length ? HINT : "" }).toEqual({
      changed: [],
      removed: [],
      hint: "",
    });
  });

  it("every fingerprinted key has a valid, non-future date", () => {
    const tomorrow = REAL_NOW + 86_400_000;
    for (const k of Object.keys(COPY_FINGERPRINTS)) {
      const d = COPY_UPDATED_AT[k];
      expect(d, `${k} has no COPY_UPDATED_AT date. ${HINT}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(d)).toBeLessThanOrEqual(tomorrow);
    }
    expect(Object.keys(COPY_UPDATED_AT).sort()).toEqual(Object.keys(COPY_FINGERPRINTS).sort());
  });

  it("copyUpdatedFor walks to the fallback key", () => {
    const bare = COPY_UPDATED_AT["apptrial:day3"];
    expect(bare).toBeTruthy();
    const ownModule = COPY_UPDATED_AT["apptrial:day3.mod-walmart.power"];
    expect(copyUpdatedFor("apptrial", "day3.mod-walmart.power")).toBe(
      ownModule ?? COPY_UPDATED_AT["apptrial:day3.mod-walmart"] ?? COPY_UPDATED_AT["apptrial:day3.power"] ?? bare,
    );
    expect(copyUpdatedFor("nope", "day0")).toBeNull();
    expect(newestCopyDateForFunnel("trial")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe.skipIf(!STAMP_OUT)("funnel copy stamp mode", () => {
  it("wrote the current fingerprints", () => {
    expect(fs.existsSync(STAMP_OUT)).toBe(true);
  });
});
