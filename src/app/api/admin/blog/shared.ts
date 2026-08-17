/**
 * Summary: Shared server helpers for the admin blog manager API routes.
 *   Loads/serializes the content/blog/_index.json manifest from GitHub (the
 *   source of truth; the locally bundled copy is stale between deploys),
 *   validates post entries, and derives publish status. See lib/github-content
 *   for why persistence is git commits rather than filesystem writes.
 * Dependencies: lib/blog (types), lib/blog-markdown, lib/github-content.
 */
import type { BlogManifest, BlogManifestEntry } from "@/lib/blog";
import { BLOG_LOCALES, type BlogLocale } from "@/lib/blog";
import { getTextFile, listDir } from "@/lib/github-content";

export const MANIFEST_PATH = "content/blog/_index.json";
export const CONTENT_DIR = "content/blog";

export const BLOG_CATEGORIES = ["Growth", "Amazon", "Deals", "Instagram", "Benable"] as const;

// Same idea as the drip's park idiom: dates from 2027-01-01 on mean "hidden on
// purpose". A genuinely-scheduled 2027 post would misreport as parked; that is
// acceptable, the idiom predates this UI (see memory/commit 36192d4).
export const PARK_DATE = "2027-01-01";

export type BlogPostStatus = "published" | "scheduled" | "parked";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeStatus(date: string): BlogPostStatus {
  if (date >= PARK_DATE) return "parked";
  return date <= todayISO() ? "published" : "scheduled";
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function loadManifestFromGitHub(): Promise<BlogManifest> {
  const file = await getTextFile(MANIFEST_PATH);
  if (!file) throw new Error(`${MANIFEST_PATH} not found in the content repo`);
  const parsed = JSON.parse(file.text) as BlogManifest;
  return { version: parsed.version || 1, posts: Array.isArray(parsed.posts) ? parsed.posts : [] };
}

// Manifest entry keys in the order existing entries use, so admin saves don't
// churn the diff by reordering keys.
const ENTRY_KEY_ORDER: (keyof BlogManifestEntry)[] = [
  "id",
  "title",
  "category",
  "summary",
  "date",
  "author",
  "readingTime",
  "keywords",
  "image",
  "imageAlt",
  "imagePrompt",
  "pinImage",
  "pinDescription",
  "order",
];

export function serializeManifest(manifest: BlogManifest): string {
  const posts = manifest.posts.map((entry) => {
    const ordered: Record<string, unknown> = {};
    for (const key of ENTRY_KEY_ORDER) {
      if (entry[key] !== undefined) ordered[key] = entry[key];
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!(key in ordered) && value !== undefined) ordered[key] = value;
    }
    return ordered;
  });
  return `${JSON.stringify({ version: manifest.version, posts }, null, 2)}\n`;
}

// Which locale files exist for each post id, from one directory listing.
export async function localesByPost(): Promise<Map<string, BlogLocale[]>> {
  const entries = await listDir(CONTENT_DIR);
  const map = new Map<string, BlogLocale[]>();
  for (const item of entries) {
    if (item.type !== "file") continue;
    const match = item.name.match(/^(.+)\.([a-z]{2}-[A-Z]{2})\.mdx$/);
    if (!match) continue;
    const [, id, locale] = match;
    if (!(BLOG_LOCALES as readonly string[]).includes(locale)) continue;
    const list = map.get(id) || [];
    list.push(locale as BlogLocale);
    map.set(id, list);
  }
  // en-US first, matching availableBlogLocales ordering.
  for (const list of map.values()) {
    list.sort((a, b) => BLOG_LOCALES.indexOf(a) - BLOG_LOCALES.indexOf(b));
  }
  return map;
}

// Replace em dashes (repo-wide ban, see CLAUDE.md) and normalize newlines.
// The editor warns before save; this is the defensive backstop.
export function stripEmDashes(value: string): string {
  return value.replace(/\u2014/g, "-");
}

export function sanitizeBody(body: string): string {
  return stripEmDashes(body.replace(/\r\n/g, "\n"));
}

function cleanField(value: unknown, max: number): string {
  return stripEmDashes(String(value ?? "")).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export type EntryInput = {
  id: string;
  title: string;
  category: string;
  summary: string;
  date: string;
  readingTime: string;
  keywords: string;
  imageAlt: string;
  imagePrompt?: string;
  pinImage?: string;
  pinDescription?: string;
};

export type ValidatedEntry = Omit<BlogManifestEntry, "author" | "image" | "order">;

export function validateEntry(raw: unknown): { entry: ValidatedEntry } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Missing entry" };
  const input = raw as Record<string, unknown>;

  const id = String(input.id ?? "").trim();
  if (!SLUG_RE.test(id)) {
    return { error: "id must be lowercase letters, digits, and hyphens (max 81 chars)" };
  }

  const title = cleanField(input.title, 200);
  if (!title) return { error: "title is required" };

  const category = String(input.category ?? "").trim();
  if (!(BLOG_CATEGORIES as readonly string[]).includes(category)) {
    return { error: `category must be one of: ${BLOG_CATEGORIES.join(", ")}` };
  }

  const summary = cleanField(input.summary, 400);
  if (!summary) return { error: "summary is required" };

  const date = String(input.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "date must be yyyy-mm-dd" };
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return { error: "date is not a real calendar date" };
  }

  const readingTime = cleanField(input.readingTime, 40);
  if (!/^\d+ min read$/.test(readingTime)) {
    return { error: 'readingTime must look like "7 min read"' };
  }

  const keywords = cleanField(input.keywords, 500);
  if (!keywords) return { error: "keywords are required" };

  const imageAlt = cleanField(input.imageAlt, 300);
  if (!imageAlt) return { error: "imageAlt is required" };

  const imagePrompt = cleanField(input.imagePrompt, 1000);
  const pinImage = cleanField(input.pinImage, 200);
  if (pinImage && !pinImage.startsWith("/assets/")) {
    return { error: "pinImage must be a /assets/ path" };
  }
  const pinDescription = cleanField(input.pinDescription, 600);

  return {
    entry: {
      id,
      title,
      category,
      summary,
      date,
      readingTime,
      keywords,
      imageAlt,
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(pinImage ? { pinImage } : {}),
      ...(pinDescription ? { pinDescription } : {}),
    },
  };
}

export function validateBody(raw: unknown): { body: string } | { error: string } {
  const body = sanitizeBody(String(raw ?? ""));
  if (!body.trim()) return { error: "body is required" };
  if (body.length > 60_000) return { error: "body is too long (60k character max)" };
  return { body: body.trim() };
}
