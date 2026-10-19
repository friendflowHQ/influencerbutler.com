/**
 * Summary: Blog loader. Reads the per-post Markdown/MDX files in content/blog/,
 *   plus the _index.json manifest. Used by the public /blog listing and
 *   /blog/[slug] article routes. Mirrors the structure of lib/tutorials.ts,
 *   including its locale handling: each post can ship as <id>.<locale>.mdx for
 *   en-US, es-ES, and fr-FR, and a missing locale falls back to en-US. Posts
 *   that only exist in English simply serve English everywhere.
 * Dependencies: node:fs/promises, node:path, ./blog-markdown (pure parse/render
 *   helpers shared with the admin blog editor).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, renderMarkdown } from "./blog-markdown";

// Re-export the pure helpers so existing server-side importers keep working.
export { escapeHtml, parseFrontmatter, renderInline, renderMarkdown } from "./blog-markdown";

export type BlogManifestEntry = {
  id: string;
  title: string;
  category: string;
  // Optional comma-separated list of extra topic tags shown alongside the
  // primary category (e.g. "Instagram, Facebook, Proxy"), for posts that
  // genuinely span more than one platform/topic. Purely cosmetic: it does
  // not affect the category-based "More in X" related rail or filtering.
  tags?: string;
  summary: string;
  date: string; // ISO yyyy-mm-dd
  // Optional ISO yyyy-mm-dd of the last substantive edit. Drives dateModified in
  // structured data, the "Updated" label and the sitemap lastmod. Set it only
  // after a real content update; when absent the publish date is used.
  updated?: string;
  author: string;
  readingTime: string;
  keywords: string;
  image: string; // /assets/blog/<slug>.png
  imageAlt: string;
  // Optional prompt used by scripts/generate-blog-images.mjs and the admin
  // blog editor's AI hero generator. Not read by the public pages.
  imagePrompt?: string;
  // Optional vertical (2:3) Pinterest pin image, e.g. /assets/blog/pins/<slug>.png.
  // When present it is used as the Pinterest share media; otherwise `image` is.
  pinImage?: string;
  // Optional pre-written Pinterest description. The public page recomputes its
  // own via buildPinDescription; kept here so the admin editor round-trips it.
  pinDescription?: string;
  // Optional. A retired post keeps its MDX on disk but leaves the listing,
  // related-post rails, search and sitemap, and its URL redirects to /blog.
  // Used to pull a seasonal run (Prime Day) once the season is over without
  // deleting the files, so it can be un-retired next year by flipping the flag.
  retired?: boolean;
  order: number;
};

export type BlogManifest = {
  version: number;
  posts: BlogManifestEntry[];
};

export const BLOG_LOCALES = ["en-US", "es-ES", "fr-FR"] as const;
export type BlogLocale = (typeof BLOG_LOCALES)[number];
export const DEFAULT_BLOG_LOCALE: BlogLocale = "en-US";

export function isBlogLocale(value: string | undefined | null): value is BlogLocale {
  return !!value && (BLOG_LOCALES as readonly string[]).includes(value);
}

// Normalize a requested locale to a supported one, defaulting to en-US. Accepts
// full tags (es-ES) and bare language codes (es, fr) for friendlier URLs.
export function resolveBlogLocale(requested?: string | null): BlogLocale {
  if (isBlogLocale(requested)) return requested;
  const bare = (requested || "").slice(0, 2).toLowerCase();
  const match = BLOG_LOCALES.find((l) => l.slice(0, 2).toLowerCase() === bare);
  return match || DEFAULT_BLOG_LOCALE;
}

export type LoadedBlogPost = {
  id: string;
  locale: BlogLocale; // the locale actually served (after en-US fallback)
  frontmatter: {
    title?: string;
    summary?: string;
    category?: string;
    tags?: string;
    date?: string;
    updated?: string;
    author?: string;
    readingTime?: string;
    keywords?: string;
    image?: string;
    imageAlt?: string;
    [key: string]: unknown;
  };
  html: string;
  raw: string;
};

const CONTENT_ROOT = path.join(process.cwd(), "content", "blog");

let cachedManifest: BlogManifest | null = null;
let cachedManifestAt = 0;
const MANIFEST_CACHE_MS = 30_000;

export async function loadBlogManifest(): Promise<BlogManifest> {
  if (cachedManifest && Date.now() - cachedManifestAt < MANIFEST_CACHE_MS) {
    return cachedManifest;
  }
  const raw = await readFile(path.join(CONTENT_ROOT, "_index.json"), "utf8");
  const parsed = JSON.parse(raw) as BlogManifest;
  const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  // Newest first by date, then by explicit order as a tiebreaker.
  posts.sort((a, b) => {
    const byDate = (b.date || "").localeCompare(a.date || "");
    if (byDate !== 0) return byDate;
    return (a.order || 0) - (b.order || 0);
  });
  cachedManifest = { version: parsed.version || 1, posts };
  cachedManifestAt = Date.now();
  return cachedManifest;
}

// Today's date in UTC as a yyyy-mm-dd string. Compared lexicographically
// against a post's `date` (also yyyy-mm-dd), which is correct for ISO dates.
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Best Pinterest image for a post: the vertical pin (entry.pinImage) when set,
// otherwise the landscape hero image. Every post's vertical pin is committed
// alongside its manifest entry, so we trust pinImage without a runtime
// filesystem check. A dynamic fs lookup here (existsSync on process.cwd()/
// public/...) would force Next's file tracer to bundle the whole public/ folder
// into the blog/[slug] serverless function and exceed Vercel's 300mb limit.
export function resolvePinImage(
  pinImage: string | undefined,
  heroImage: string,
): string {
  return pinImage || heroImage;
}

// A post is "published" once its date has arrived (date <= today, UTC).
// This is the whole drip mechanism: posts are committed with future dates and
// reveal themselves on their own day with no scheduled job. A missing date
// means always-visible (defensive default).
export function isPublished(dateISO?: string): boolean {
  if (!dateISO) return true;
  return dateISO <= todayISO();
}

// A post is "listed" when it has published and has not been retired. This is
// the filter every public surface (listing, related rails, search, sitemap)
// should use; isPublished alone would resurface retired seasonal posts.
export function isListed(entry: Pick<BlogManifestEntry, "date" | "retired">): boolean {
  return !entry.retired && isPublished(entry.date);
}

// All posts whose publish date has arrived and that are not retired, newest
// first (manifest is already sorted newest-first by loadBlogManifest).
export async function loadPublishedPosts(): Promise<BlogManifestEntry[]> {
  const manifest = await loadBlogManifest();
  return manifest.posts.filter((p) => isListed(p));
}

// A post's primary category plus its optional extra tags, as one flat list of
// clickable "topics" (used for the /blog?tag= filter and its chip links).
export function postTopics(post: Pick<BlogManifestEntry, "category" | "tags">): string[] {
  const extra = (post.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return [post.category, ...extra].filter(Boolean);
}

async function readBlogFile(id: string, locale: BlogLocale): Promise<string | null> {
  try {
    return await readFile(path.join(CONTENT_ROOT, `${id}.${locale}.mdx`), "utf8");
  } catch {
    return null;
  }
}

// Which locales this post actually ships as a file for, en-US first. Used to
// render the language switcher so we only offer translations that exist.
export async function availableBlogLocales(id: string): Promise<BlogLocale[]> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) return [];
  const present = await Promise.all(
    BLOG_LOCALES.map(async (locale) => ((await readBlogFile(id, locale)) ? locale : null)),
  );
  return present.filter((l): l is BlogLocale => l !== null);
}

export async function loadBlogPost(
  id: string,
  requestedLocale?: string,
): Promise<LoadedBlogPost | null> {
  // Strict ID guard - no path traversal.
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) return null;
  const locale = resolveBlogLocale(requestedLocale);
  let raw = await readBlogFile(id, locale);
  let resolvedLocale: BlogLocale = locale;
  // Fall back to English when the requested locale has no translation on disk.
  if (!raw && locale !== DEFAULT_BLOG_LOCALE) {
    raw = await readBlogFile(id, DEFAULT_BLOG_LOCALE);
    resolvedLocale = DEFAULT_BLOG_LOCALE;
  }
  if (!raw) return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  const html = renderMarkdown(body);
  return { id, locale: resolvedLocale, frontmatter, html, raw };
}

export function formatBlogDate(iso: string, locale: BlogLocale = DEFAULT_BLOG_LOCALE): string {
  // Parse as UTC date-only to avoid timezone drift on the server.
  const parts = iso.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function clearBlogCache() {
  cachedManifest = null;
  cachedManifestAt = 0;
}
