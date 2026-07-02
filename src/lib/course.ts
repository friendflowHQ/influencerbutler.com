/**
 * Summary: Course helpers over the tutorial manifest. A "course" is the set
 *   of tutorials sharing a `series` id, ordered by `seriesOrder`. Used by the
 *   /course/* hub pages and the tutorial page's course progress UI.
 */
import type { TutorialManifest, TutorialManifestEntry } from "./tutorials";

export const AMAZON_INFLUENCER_COURSE_ID = "amazon-influencer-course";

export type CourseModule = TutorialManifestEntry & { seriesOrder: number };

/** Ordered modules of one course (empty array when the series is unknown). */
export function getCourseModules(manifest: TutorialManifest, seriesId: string): CourseModule[] {
  return manifest.tutorials
    .filter((t): t is CourseModule => t.series === seriesId && typeof t.seriesOrder === "number")
    .slice()
    .sort((a, b) => a.seriesOrder - b.seriesOrder);
}

/** Previous/next modules around `moduleId`, or null at either edge. */
export function getModuleNeighbors(
  modules: CourseModule[],
  moduleId: string,
): { prev: CourseModule | null; next: CourseModule | null } {
  const idx = modules.findIndex((m) => m.id === moduleId);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? modules[idx - 1] : null,
    next: idx < modules.length - 1 ? modules[idx + 1] : null,
  };
}

/** The course a tutorial belongs to, or null. */
export function getSeriesForTutorial(entry: TutorialManifestEntry | undefined | null): string | null {
  if (!entry || typeof entry.series !== "string" || !entry.series) return null;
  return entry.series;
}
