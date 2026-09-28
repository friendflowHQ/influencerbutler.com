/**
 * Client-safe types and constants for the admin blog manager. The server
 * equivalents live in api/admin/blog/shared.ts, which cannot be imported here
 * because it pulls in node-only modules; keep BLOG_CATEGORIES and PARK_DATE in
 * sync with that file.
 */
import type { BlogManifestEntry, BlogLocale } from "@/lib/blog";

export type { BlogManifestEntry, BlogLocale };

export type BlogPostStatus = "published" | "scheduled" | "parked";

export type AdminBlogPost = BlogManifestEntry & {
  status: BlogPostStatus;
  locales: BlogLocale[];
};

export const BLOG_CATEGORIES = ["Growth", "Amazon", "Deals", "Instagram", "Benable"] as const;

// Posts dated 2027-01-01 or later are parked (deliberately unpublished), the
// idiom the drip schedule already uses.
export const PARK_DATE = "2027-01-01";

export const STATUS_BADGE: Record<BlogPostStatus, string> = {
  published: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-amber-50 text-amber-700",
  parked: "bg-slate-100 text-slate-600",
};

export const STATUS_LABEL: Record<BlogPostStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  parked: "Parked",
};

export function computeStatusClient(date: string, today: string): BlogPostStatus {
  if (date >= PARK_DATE) return "parked";
  return date <= today ? "published" : "scheduled";
}

// sessionStorage keys shared between the list page and the editor.
export const DUPLICATE_KEY = "adminBlogDuplicate";
export const DEPLOY_NOTICE_KEY = "adminBlogDeployNotice";

export function setDeployNotice(commitSha: string, verb: string) {
  try {
    sessionStorage.setItem(DEPLOY_NOTICE_KEY, JSON.stringify({ commitSha, verb, at: Date.now() }));
  } catch {
    // Storage unavailable (private mode); the banner is best-effort.
  }
}

export function takeDeployNotice(): { commitSha: string; verb: string } | null {
  try {
    const raw = sessionStorage.getItem(DEPLOY_NOTICE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DEPLOY_NOTICE_KEY);
    const parsed = JSON.parse(raw) as { commitSha: string; verb: string; at: number };
    // Stale notices (>10 min) are not worth showing.
    if (Date.now() - parsed.at > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
