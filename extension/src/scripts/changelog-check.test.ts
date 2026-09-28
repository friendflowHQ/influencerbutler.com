import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  compareSemver,
  hasReleaseEntry,
  parseSemver,
  validateChangelog,
  type Changelog,
} from "../../scripts/changelog-check.mjs";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function release(version: string, items: string[] = ["Something shipped"]): Changelog["releases"][number] {
  return {
    version,
    date: "January 1, 2026",
    sections: [{ heading: "New Features", items }],
  };
}

describe("hasReleaseEntry", () => {
  it("is true when the exact version exists with a non-empty item", () => {
    const changelog: Changelog = { releases: [release("0.2.0"), release("0.1.9")] };
    expect(hasReleaseEntry(changelog, "0.1.9")).toBe(true);
    expect(hasReleaseEntry(changelog, "0.2.0")).toBe(true);
  });

  it("is false when the version is missing", () => {
    const changelog: Changelog = { releases: [release("0.1.9")] };
    expect(hasReleaseEntry(changelog, "0.1.10")).toBe(false);
  });

  it("requires an exact match, not a prefix or the newest release", () => {
    const changelog: Changelog = { releases: [release("0.1.10")] };
    expect(hasReleaseEntry(changelog, "0.1.1")).toBe(false);
    expect(hasReleaseEntry(changelog, "0.1")).toBe(false);
  });

  it("is false when every section is empty or blank", () => {
    const changelog: Changelog = {
      releases: [
        {
          version: "0.1.9",
          date: "January 1, 2026",
          sections: [
            { heading: "New Features", items: [] },
            { heading: "Bug Fixes", items: ["", "   "] },
          ],
        },
      ],
    };
    expect(hasReleaseEntry(changelog, "0.1.9")).toBe(false);
  });

  it("is false for a release with no sections at all", () => {
    const changelog = { releases: [{ version: "0.1.9", date: "x", sections: [] }] };
    expect(hasReleaseEntry(changelog, "0.1.9")).toBe(false);
  });

  it("tolerates garbage input", () => {
    expect(hasReleaseEntry(null, "0.1.9")).toBe(false);
    expect(hasReleaseEntry({}, "0.1.9")).toBe(false);
    expect(hasReleaseEntry({ releases: "nope" }, "0.1.9")).toBe(false);
    expect(hasReleaseEntry({ releases: [null, { version: "0.1.9" }] }, "0.1.9")).toBe(false);
  });
});

describe("validateChangelog", () => {
  it("accepts a well-formed newest-first changelog", () => {
    const changelog: Changelog = {
      lastUpdated: "2026-09-06",
      releases: [release("0.1.13"), release("0.1.12"), release("0.1.9")],
    };
    expect(validateChangelog(changelog)).toEqual({ ok: true, errors: [] });
  });

  it("rejects non-object input and a missing releases array", () => {
    expect(validateChangelog(null).ok).toBe(false);
    expect(validateChangelog("x").ok).toBe(false);
    expect(validateChangelog([]).ok).toBe(false);
    const result = validateChangelog({});
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("releases must be an array");
  });

  it("flags duplicate versions", () => {
    const result = validateChangelog({ releases: [release("0.1.10"), release("0.1.10")] });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain('"0.1.10" appears more than once');
  });

  it("flags releases that are not strictly descending by semver", () => {
    // 0.1.9 before 0.1.10 is the classic string-sort trap; 0.2.0 after 0.1.13 too.
    const ascending = validateChangelog({ releases: [release("0.1.9"), release("0.1.10")] });
    expect(ascending.ok).toBe(false);
    expect(ascending.errors.join("\n")).toContain("not newest-first");

    const minorLater = validateChangelog({ releases: [release("0.1.13"), release("0.2.0")] });
    expect(minorLater.ok).toBe(false);

    const correct = validateChangelog({ releases: [release("0.2.0"), release("0.1.13"), release("0.1.9")] });
    expect(correct.ok).toBe(true);
  });

  it("flags malformed releases, sections, and items", () => {
    const result = validateChangelog({
      lastUpdated: "Sept 6",
      releases: [
        { version: "", date: "", sections: [] },
        { version: "banana", date: "x", sections: [{ heading: "", items: ["ok", "", 5] }] },
        { version: "0.1.1", date: "x", sections: [{ heading: "Bug Fixes", items: "not-a-list" }] },
      ],
    });
    expect(result.ok).toBe(false);
    const text = result.errors.join("\n");
    expect(text).toContain("lastUpdated");
    expect(text).toContain("releases[0].version must be a non-empty string");
    expect(text).toContain("releases[0].sections must be a non-empty array");
    expect(text).toContain('"banana" is not a valid x.y.z version');
    expect(text).toContain("releases[1].sections[0].heading must be a non-empty string");
    expect(text).toContain("releases[1].sections[0].items[1] must be a non-empty string");
    expect(text).toContain("releases[1].sections[0].items[2] must be a non-empty string");
    expect(text).toContain("releases[2].sections[0].items must be an array");
  });

  it("flags em dashes in items (repo rule)", () => {
    const result = validateChangelog({
      releases: [release("0.1.9", [`Link Butler ${String.fromCharCode(0x2014)} now faster`])],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("em dash");
  });
});

describe("semver helpers", () => {
  it("parses x.y.z and pre-release tags", () => {
    expect(parseSemver("0.1.13")).toEqual({ major: 0, minor: 1, patch: 13, prerelease: null });
    expect(parseSemver("1.2.3-beta.1")?.prerelease).toBe("beta.1");
    expect(parseSemver("0.1")).toBeNull();
    expect(parseSemver("v0.1.0")).toBeNull();
  });

  it("orders numerically, not lexically", () => {
    expect(compareSemver("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareSemver("0.1.9", "0.1.10")).toBeLessThan(0);
    expect(compareSemver("0.2.0", "0.1.99")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0-beta", "1.0.0")).toBeLessThan(0);
  });
});

describe("static/changelog.json (real fixture)", () => {
  const raw = fs.readFileSync(path.join(extensionRoot, "static", "changelog.json"), "utf8");
  const changelog = JSON.parse(raw) as Changelog;
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as {
    version: string;
  };

  it("parses and validates", () => {
    expect(validateChangelog(changelog)).toEqual({ ok: true, errors: [] });
  });

  it("has an entry for the version in package.json", () => {
    expect(hasReleaseEntry(changelog, pkg.version)).toBe(true);
  });

  it("is dated by its newest release", () => {
    // lastUpdated is an ISO date; releases[0].date is human-readable. Both
    // must describe the same day so the file never claims a stale freshness.
    const newest = changelog.releases[0];
    expect(newest).toBeDefined();
    const iso = changelog.lastUpdated ?? "";
    const parsed = new Date(`${newest?.date} UTC`);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.toISOString().slice(0, 10)).toBe(iso);
  });

  it("only uses headings the What's New notice knows how to render", () => {
    const known = new Set(["new features", "bug fixes", "other notable changes"]);
    for (const r of changelog.releases) {
      for (const s of r.sections) {
        expect(known.has(s.heading.trim().toLowerCase()), `${r.version}: ${s.heading}`).toBe(true);
      }
    }
  });
});
