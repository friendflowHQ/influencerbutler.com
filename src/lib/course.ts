/**
 * Summary: Course helpers over the tutorial manifest. A "course" is the set
 *   of tutorials sharing a `series` id, ordered by `seriesOrder`. Used by the
 *   /course/* hub pages and the tutorial page's course progress UI.
 */
import type { TutorialManifest, TutorialManifestEntry } from "./tutorials";

export const AMAZON_INFLUENCER_COURSE_ID = "amazon-influencer-course";

/** Display emoji per module, used on the hub cards, module pages, and the
 *  desktop app's help nav. Keyed by tutorial id; fallback is a book. */
export const COURSE_MODULE_EMOJI: Record<string, string> = {
  "aip-course-01-start-here": "🚀",
  "aip-course-02-what-is-the-amazon-influencer-program": "💡",
  "aip-course-03-requirements-and-applying": "📝",
  "aip-course-04-onsite-video-approval": "🎯",
  "aip-course-05-filming-review-videos": "🎬",
  "aip-course-06-upload-and-optimize": "🏷️",
  "aip-course-07-build-your-storefront": "🏪",
  "aip-course-08-reports-and-analytics": "📊",
  "aip-course-09-first-30-days": "📅",
  "aip-course-10-scaling-and-automation": "📈",
  "aip-course-11-faq": "💬",
};

export function moduleEmoji(id: string): string {
  return COURSE_MODULE_EMOJI[id] || "📘";
}

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
