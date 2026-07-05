/**
 * Summary: Tests for the course helpers (module ordering, prev/next) and the
 *   locale step-anchor parity rule for course MDX content: every locale file
 *   of a module must declare the identical set of {#step-id} anchors so
 *   progress keys stay locale-independent.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getCourseModules, getModuleNeighbors } from "../course";
import type { TutorialManifest } from "../tutorials";

const manifest: TutorialManifest = {
  version: 1,
  tutorials: [
    { id: "other", title: "Other", category: "Misc", summary: "", order: 10, locales: ["en-US"] },
    { id: "m2", title: "Two", category: "Course", summary: "", order: 201, locales: ["en-US"], series: "c", seriesOrder: 2 },
    { id: "m1", title: "One", category: "Course", summary: "", order: 202, locales: ["en-US"], series: "c", seriesOrder: 1 },
    { id: "m3", title: "Three", category: "Course", summary: "", order: 200, locales: ["en-US"], series: "c", seriesOrder: 3 },
  ],
};

describe("getCourseModules", () => {
  it("filters by series and sorts by seriesOrder regardless of manifest order", () => {
    const modules = getCourseModules(manifest, "c");
    expect(modules.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("returns empty for an unknown series", () => {
    expect(getCourseModules(manifest, "nope")).toEqual([]);
  });
});

describe("getModuleNeighbors", () => {
  const modules = getCourseModules(manifest, "c");

  it("returns prev/next in the middle", () => {
    const { prev, next } = getModuleNeighbors(modules, "m2");
    expect(prev?.id).toBe("m1");
    expect(next?.id).toBe("m3");
  });

  it("returns null at the edges and for unknown ids", () => {
    expect(getModuleNeighbors(modules, "m1").prev).toBeNull();
    expect(getModuleNeighbors(modules, "m3").next).toBeNull();
    expect(getModuleNeighbors(modules, "zz")).toEqual({ prev: null, next: null });
  });
});

describe("course content locale parity", () => {
  function extractAnchors(raw: string): string[] {
    const anchors: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*]\s+\[(?: |x|X)\]\s+.*\{#([a-z0-9-]{1,40})\}\s*$/);
      if (m) anchors.push(m[1]);
    }
    return anchors;
  }

  it("every locale of each aip-course module declares identical step anchors", async () => {
    const root = path.join(process.cwd(), "content", "tutorials");
    const files = (await readdir(root)).filter((f) => f.startsWith("aip-course-") && f.endsWith(".mdx"));
    const byModule = new Map<string, Map<string, string[]>>();
    for (const file of files) {
      const m = file.match(/^(.*)\.([a-z]{2}-[A-Z]{2})\.mdx$/);
      if (!m) continue;
      const raw = await readFile(path.join(root, file), "utf8");
      if (!byModule.has(m[1])) byModule.set(m[1], new Map());
      byModule.get(m[1])!.set(m[2], extractAnchors(raw));
    }
    for (const [moduleId, locales] of byModule) {
      const reference = locales.get("en-US");
      expect(reference, `${moduleId} must have an en-US file`).toBeDefined();
      for (const [locale, anchors] of locales) {
        expect(anchors, `${moduleId}.${locale} step anchors must match en-US`).toEqual(reference);
      }
    }
  });

  it("course steps always use explicit anchors (no positional fallback)", async () => {
    const root = path.join(process.cwd(), "content", "tutorials");
    const files = (await readdir(root)).filter((f) => f.startsWith("aip-course-") && f.endsWith(".mdx"));
    for (const file of files) {
      const raw = await readFile(path.join(root, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        if (/^\s*[-*]\s+\[(?: |x|X)\]\s+/.test(line)) {
          expect(line, `unanchored task step in ${file}: "${line.trim()}"`).toMatch(
            /\{#[a-z0-9-]{1,40}\}\s*$/,
          );
        }
      }
    }
  });
});
