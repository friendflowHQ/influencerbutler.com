/**
 * Summary: Tests for the Build Week constants and copy: the launch flag, the
 *   milestone order and Mountain Time offsets (daylight time ends Nov 1, 2026),
 *   next-milestone selection, and that all three locales carry the same shape,
 *   resolve safely from ?lang=, and contain no em or en dashes (site rule).
 * Dependencies: vitest, @/lib/build-week, @/app/build-week/_copy.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  BUILD_WEEK_DATES,
  BUILD_WEEK_MILESTONES,
  isBuildWeekEnabled,
  nextMilestone,
} from "@/lib/build-week";
import {
  BUILD_WEEK_COPY,
  BUILD_WEEK_LOCALES,
  buildWeekCopy,
  resolveBuildWeekLocale,
} from "@/app/build-week/_copy";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED;
});

describe("launch flag", () => {
  it("is off unless NEXT_PUBLIC_BUILD_WEEK_ENABLED is exactly 1", () => {
    expect(isBuildWeekEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED = "true";
    expect(isBuildWeekEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED = "1";
    expect(isBuildWeekEnabled()).toBe(true);
  });
});

describe("dates", () => {
  const ms = (iso: string) => new Date(iso).getTime();

  it("keeps the milestones in chronological order", () => {
    const times = BUILD_WEEK_MILESTONES.map((m) => ms(m.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("uses Mountain Daylight Time in October and Mountain Standard Time from Nov 2", () => {
    expect(BUILD_WEEK_DATES.votingClose.endsWith("-06:00")).toBe(true);
    expect(BUILD_WEEK_DATES.buildStart.endsWith("-07:00")).toBe(true);
    expect(BUILD_WEEK_DATES.buildDeadline.endsWith("-07:00")).toBe(true);
  });

  it("matches the rules: voting closes Oct 31 11:59 PM MT, deadline Nov 8 11:59 PM MT", () => {
    expect(new Date(BUILD_WEEK_DATES.votingClose).toISOString()).toBe("2026-11-01T05:59:00.000Z");
    expect(new Date(BUILD_WEEK_DATES.buildDeadline).toISOString()).toBe("2026-11-09T06:59:00.000Z");
  });

  it("gives a Monday 9 AM to Sunday midnight window of about six and a half days", () => {
    const days = (ms(BUILD_WEEK_DATES.buildDeadline) - ms(BUILD_WEEK_DATES.buildStart)) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7);
  });

  it("picks the next milestone and returns null after the deadline", () => {
    expect(nextMilestone(new Date("2026-10-08T12:00:00Z"))?.key).toBe("ideasOpen");
    expect(nextMilestone(new Date("2026-10-15T12:00:00Z"))?.key).toBe("ideasClose");
    expect(nextMilestone(new Date("2026-10-30T12:00:00Z"))?.key).toBe("votingClose");
    expect(nextMilestone(new Date("2026-11-01T20:00:00Z"))?.key).toBe("buildStart");
    expect(nextMilestone(new Date("2026-11-05T12:00:00Z"))?.key).toBe("buildDeadline");
    expect(nextMilestone(new Date("2026-11-10T12:00:00Z"))).toBeNull();
  });
});

describe("copy", () => {
  it("resolves ?lang= safely and falls back to English", () => {
    expect(resolveBuildWeekLocale("es-ES")).toBe("es-ES");
    expect(resolveBuildWeekLocale("fr-FR")).toBe("fr-FR");
    expect(resolveBuildWeekLocale("de-DE")).toBe("en-US");
    expect(resolveBuildWeekLocale(undefined)).toBe("en-US");
    expect(resolveBuildWeekLocale("<script>")).toBe("en-US");
  });

  /** Flatten to a list of key paths with array lengths so shapes can be compared. */
  const shape = (v: unknown, path = ""): string[] => {
    if (Array.isArray(v)) {
      return [`${path}[${v.length}]`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))];
    }
    if (v && typeof v === "object") {
      return Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k));
    }
    return [path];
  };

  it("has the same structure in every language", () => {
    const en = shape(BUILD_WEEK_COPY["en-US"]).sort();
    for (const l of BUILD_WEEK_LOCALES) expect(shape(BUILD_WEEK_COPY[l]).sort()).toEqual(en);
  });

  it("has no empty strings", () => {
    const empties: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") { if (!v.trim()) empties.push(path); }
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    };
    for (const l of BUILD_WEEK_LOCALES) walk(BUILD_WEEK_COPY[l], l);
    expect(empties).toEqual([]);
  });

  it("contains no em or en dashes in any language", () => {
    for (const l of BUILD_WEEK_LOCALES) {
      const text = JSON.stringify(buildWeekCopy(l));
      expect(text).not.toMatch(/[–—]/);
    }
  });

  it("names the deadline and the guarantee consistently", () => {
    const en = buildWeekCopy("en-US");
    expect(en.promise.body).toMatch(/November 8/);
    expect(en.timeline.rows.map((r) => r.when).join(" ")).toMatch(/Nov 8, 11:59 PM MT/);
    expect(en.faq.some((f) => /Mountain Time/.test(f.a))).toBe(true);
  });

  it("tells visitors in every language that the English Rules control", () => {
    expect(buildWeekCopy("en-US").rulesNote).toMatch(/English/);
    expect(buildWeekCopy("es-ES").rulesNote).toMatch(/inglés/);
    expect(buildWeekCopy("fr-FR").rulesNote).toMatch(/anglais/);
  });
});
