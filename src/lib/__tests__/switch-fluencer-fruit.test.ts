import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EXTENSION_GROUPS, EXTENSION_TOOLS } from "../extension-features";
import {
  extensionToolNamesFor,
  FLUENCER_FRUIT_CLOSES,
  SURFACE_LABEL,
  SWITCH_OFFER_CODE,
  SWITCH_OFFER_WEEKS,
  SWITCH_PATH,
  SWITCH_ROWS,
  SWITCH_SOURCE,
  SWITCH_TAG,
} from "../switch-fluencer-fruit";

// The switch guide names real surfaces. Any extension surface it cites must be
// an id in the canonical feature list, so a renamed or removed tool breaks the
// build here instead of shipping a mapping to something that no longer exists.

const root = process.cwd();
const EM_DASH = "—";
const EN_DASH = "–";

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Fluencer Fruit switch rows", () => {
  it("has unique ids and every column filled", () => {
    const ids = new Set(SWITCH_ROWS.map((r) => r.id));
    expect(ids.size).toBe(SWITCH_ROWS.length);
    expect(SWITCH_ROWS.length).toBeGreaterThanOrEqual(8);
    for (const row of SWITCH_ROWS) {
      expect(row.theirs.trim().length).toBeGreaterThan(0);
      expect(row.ours.trim().length).toBeGreaterThan(0);
      expect(row.where.trim().length).toBeGreaterThan(0);
      expect(["Free", "Pro", "All plans", "Coming"]).toContain(row.plan);
      expect(Object.keys(SURFACE_LABEL)).toContain(row.surface);
      expect(Array.isArray(row.extensionToolIds)).toBe(true);
      expect(Array.isArray(row.extensionGroupIds)).toBe(true);
    }
  });

  it("only cites extension tool ids and group ids that exist", () => {
    const toolIds = new Set(EXTENSION_TOOLS.map((t) => t.id));
    const groupIds = new Set(EXTENSION_GROUPS.map((g) => g.id));
    for (const row of SWITCH_ROWS) {
      for (const id of row.extensionToolIds) expect(toolIds.has(id)).toBe(true);
      for (const id of row.extensionGroupIds) expect(groupIds.has(id)).toBe(true);
    }
  });

  it("names at least one extension tool on every row that claims an extension surface", () => {
    for (const row of SWITCH_ROWS.filter((r) => r.surface === "extension")) {
      expect(row.extensionToolIds.length).toBeGreaterThan(0);
      expect(extensionToolNamesFor(row).length).toBe(row.extensionToolIds.length);
    }
  });

  it("marks extension rows free and keeps the mobile row honest", () => {
    for (const row of SWITCH_ROWS.filter((r) => r.surface === "extension")) {
      expect(row.plan).toBe("Free");
    }
    const mobile = SWITCH_ROWS.find((r) => r.id === "mobile");
    expect(mobile?.surface).toBe("coming");
    expect(mobile?.plan).toBe("Coming");
    expect(mobile?.ours).toMatch(/Coming: Mobile Butler/);
  });

  it("covers the jobs Fluencer Fruit was known for", () => {
    const theirs = SWITCH_ROWS.map((r) => r.theirs.toLowerCase());
    for (const job of ["product research", "campaign finder", "video counts", "earnings", "mobile", "deep links"]) {
      expect(theirs.some((t) => t.includes(job))).toBe(true);
    }
  });

  it("keeps copy free of em and en dashes", () => {
    for (const row of SWITCH_ROWS) {
      for (const text of [row.theirs, row.ours, row.where]) {
        expect(text).not.toContain(EM_DASH);
        expect(text).not.toContain(EN_DASH);
      }
    }
    for (const label of Object.values(SURFACE_LABEL)) {
      expect(label).not.toContain(EM_DASH);
    }
    expect(FLUENCER_FRUIT_CLOSES).not.toContain(EM_DASH);
  });
});

describe("Fluencer Fruit switch offer constants", () => {
  it("pins the offer code, tag, source, and path the page, route, and drip share", () => {
    expect(SWITCH_OFFER_CODE).toBe("FRUITSWITCH");
    expect(SWITCH_OFFER_WEEKS).toBe(6);
    expect(SWITCH_TAG).toBe("fluencer-fruit-switch");
    expect(SWITCH_SOURCE).toBe("fluencer-fruit-switch");
    expect(SWITCH_PATH).toBe("/switch/fluencer-fruit");
  });

  it("matches the migration's sequence trigger and links to the switch page", () => {
    const sql = read("supabase/migrations/20260908_fluencer_fruit_switch_sequence.sql");
    expect(sql).toContain(`{"kind":"tag_added","tag":"${SWITCH_TAG}"}`);
    expect(sql).toContain("'paused'");
    expect(sql).toContain(`https://www.influencerbutler.com${SWITCH_PATH}`);
    expect(sql).toContain("six weeks of Pro free");
    expect(sql).not.toContain(EM_DASH);
    expect(sql).not.toContain(EN_DASH);
    // Five steps, day offsets 0 / 2 / 5 / 9 / 13.
    const offsets = [...sql.matchAll(/'1a5e000b-0000-4000-a000-00000000000b', (\d), (\d+),/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(offsets).toEqual([
      [1, 0],
      [2, 2],
      [3, 5],
      [4, 9],
      [5, 13],
    ]);
  });

  it("keeps the landing page and CTA free of em dashes and on the shared code", () => {
    const page = read("src/app/switch/fluencer-fruit/page.tsx");
    const cta = read("src/app/switch/fluencer-fruit/SwitchOfferCta.tsx");
    const capture = read("src/app/switch/fluencer-fruit/SwitchEmailCapture.tsx");
    for (const src of [page, cta, capture]) {
      expect(src).not.toContain(EM_DASH);
      expect(src).not.toContain(EN_DASH);
    }
    expect(cta).toContain("SWITCH_OFFER_CODE");
    expect(cta).toContain("/api/me/subscription-details");
    expect(cta).toContain("/api/promo/touch");
    expect(page).toContain('process.env.FLUENCER_SWITCH_ENABLED === "1"');
    expect(page).toContain("/go/download?src=switch-fruit");
    expect(capture).toContain("/api/switch/subscribe");
  });
});
