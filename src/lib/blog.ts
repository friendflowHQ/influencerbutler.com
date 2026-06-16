/**
 * Summary: Blog loader. Reads the per-post Markdown/MDX files in content/blog/,
 *   plus the _index.json manifest. Used by the public /blog listing and
 *   /blog/[slug] article routes. Mirrors the structure of lib/tutorials.ts but
 *   is self-contained so the live tutorials path is never disturbed. The blog
 *   is English-only for launch (no locale suffix on the files).
 * Dependencies: node:fs/promises, node:path.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type BlogManifestEntry = {
  id: string;
  title: string;
  category: string;
  summary: string;
  date: string; // ISO yyyy-mm-dd
  author: string;
  readingTime: string;
  keywords: string;
  image: string; // /assets/blog/<slug>.png
  imageAlt: string;
  order: number;
};

export type BlogManifest = {
  version: number;
  posts: BlogManifestEntry[];
};

export type LoadedBlogPost = {
  id: string;
  frontmatter: {
    title?: string;
    summary?: string;
    category?: string;
    date?: string;
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

// A post is "published" once its date has arrived (date <= today, UTC).
// This is the whole drip mechanism: posts are committed with future dates and
// reveal themselves on their own day with no scheduled job. A missing date
// means always-visible (defensive default).
export function isPublished(dateISO?: string): boolean {
  if (!dateISO) return true;
  return dateISO <= todayISO();
}

// All posts whose publish date has arrived, newest first (manifest is already
// sorted newest-first by loadBlogManifest).
export async function loadPublishedPosts(): Promise<BlogManifestEntry[]> {
  const manifest = await loadBlogManifest();
  return manifest.posts.filter((p) => isPublished(p.date));
}

function parseFrontmatter(source: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }
  const yaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const fmMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!fmMatch) continue;
    const key = fmMatch[1];
    let value: string = fmMatch[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function renderInline(line: string): string {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);
  // ![alt](path) must run BEFORE the link regex so the leading `!` is not
  // consumed by it. Only same-origin /assets/ paths render.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
    const safeSrc = src.startsWith("/assets/") ? src : "";
    if (!safeSrc) return "";
    return `<img src="${safeSrc}" alt="${alt}" loading="lazy" />`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, href: string) => {
    // Allow absolute http(s) links and same-origin root-relative links so we
    // can deep-link to /pricing, /features/*, other /blog posts, etc.
    const isAbsolute = /^https?:\/\//i.test(href);
    const isRootRelative = /^\/[A-Za-z0-9]/.test(href);
    const safeHref = isAbsolute || isRootRelative ? href : "#";
    // External links in the blog are affiliate/partner links (e.g. the Benable
    // referral), so mark them nofollow + sponsored per search-engine guidelines.
    // This is SEO-only and does not affect referral tracking or commissions.
    const external = isAbsolute ? ' rel="nofollow sponsored noreferrer noopener" target="_blank"' : "";
    return `<a href="${safeHref}"${external}>${text}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

// Small, sandboxed Markdown subset: headings, paragraphs, bullet/ordered
// lists, fenced code blocks, blockquotes, inline code/bold/italic/links/images.
function renderMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function closeList() {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^\s*$/.test(line)) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    // Standalone image line: ![alt](/assets/...) on its own line -> figure.
    const imgLine = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgLine) {
      closeList();
      const alt = imgLine[1];
      const src = imgLine[2].startsWith("/assets/") ? imgLine[2] : "";
      if (src) {
        out.push(`<figure><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" /></figure>`);
      }
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }
    const quote = line.match(/^>\s+(.*)$/);
    if (quote) {
      closeList();
      out.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`);
      continue;
    }
    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

async function readBlogFile(id: string): Promise<string | null> {
  try {
    return await readFile(path.join(CONTENT_ROOT, `${id}.en-US.mdx`), "utf8");
  } catch {
    return null;
  }
}

export async function loadBlogPost(id: string): Promise<LoadedBlogPost | null> {
  // Strict ID guard - no path traversal.
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) return null;
  const raw = await readBlogFile(id);
  if (!raw) return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  const html = renderMarkdown(body);
  return { id, frontmatter, html, raw };
}

export function formatBlogDate(iso: string): string {
  // Parse as UTC date-only to avoid timezone drift on the server.
  const parts = iso.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso;
  const d = new Date(Dat