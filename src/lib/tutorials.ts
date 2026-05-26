/**
 * Summary: Tutorial loader. Reads the per-workspace MDX/Markdown files in
 *   content/tutorials/, plus the _index.json manifest. Used by /help pages
 *   and the /api/help/* routes. Falls back to en-US when a locale-specific
 *   file is missing.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type TutorialManifestEntry = {
  id: string;
  title: string;
  category: string;
  summary: string;
  order: number;
  locales: string[];
};

export type TutorialManifest = {
  version: number;
  tutorials: TutorialManifestEntry[];
};

export type LoadedTutorial = {
  id: string;
  locale: string;
  frontmatter: {
    title?: string;
    summary?: string;
    category?: string;
    [key: string]: unknown;
  };
  html: string;
  raw: string;
};

const CONTENT_ROOT = path.join(process.cwd(), "content", "tutorials");
const SUPPORTED_LOCALES = ["en-US", "es-ES", "fr-FR"] as const;
const DEFAULT_LOCALE = "en-US";

let cachedManifest: TutorialManifest | null = null;
let cachedManifestAt = 0;
const MANIFEST_CACHE_MS = 30_000;

export async function loadManifest(): Promise<TutorialManifest> {
  if (cachedManifest && Date.now() - cachedManifestAt < MANIFEST_CACHE_MS) {
    return cachedManifest;
  }
  const raw = await readFile(path.join(CONTENT_ROOT, "_index.json"), "utf8");
  const parsed = JSON.parse(raw) as TutorialManifest;
  const tutorials = Array.isArray(parsed.tutorials) ? parsed.tutorials : [];
  tutorials.sort((a, b) => (a.order || 0) - (b.order || 0));
  cachedManifest = { version: parsed.version || 1, tutorials };
  cachedManifestAt = Date.now();
  return cachedManifest;
}

function isLocale(value: string): value is (typeof SUPPORTED_LOCALES)[number] {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function resolveLocale(requested?: string): string {
  if (requested && isLocale(requested)) return requested;
  return DEFAULT_LOCALE;
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
  // ![alt](path) - must run BEFORE the link regex so the leading `!`
  // isn't consumed by it. Only same-origin /assets/ paths render.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
    const safeSrc = src.startsWith("/assets/") ? src : "";
    if (!safeSrc) return "";
    return `<img src="${safeSrc}" alt="${alt}" loading="lazy" />`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, href: string) => {
    const safeHref = /^https?:\/\//i.test(href) ? href : "#";
    return `<a href="${safeHref}" rel="noreferrer noopener" target="_blank">${text}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

// Small, sandboxed Markdown subset: headings, paragraphs, bullet/ordered
// lists, fenced code blocks, blockquotes, inline code/bold/italic/links.
// Intentionally minimal - tutorials are content-heavy but structurally
// simple, and avoiding a full Markdown lib keeps the bundle lean.
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

async function readTutorialFile(id: string, locale: string): Promise<string | null> {
  try {
    return await readFile(path.join(CONTENT_ROOT, `${id}.${locale}.mdx`), "utf8");
  } catch {
    return null;
  }
}

export async function loadTutorial(id: string, requestedLocale?: string): Promise<LoadedTutorial | null> {
  const locale = resolveLocale(requestedLocale);
  // Strict ID guard - no path traversal.
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) return null;

  let raw = await readTutorialFile(id, locale);
  let resolvedLocale = locale;
  if (!raw && locale !== DEFAULT_LOCALE) {
    raw = await readTutorialFile(id, DEFAULT_LOCALE);
    resolvedLocale = DEFAULT_LOCALE;
  }
  if (!raw) return null;

  const { frontmatter, body } = parseFrontmatter(raw);
  const html = renderMarkdown(body);
  return {
    id,
    locale: resolvedLocale,
    frontmatter,
    html,
    raw,
  };
}

export function clearTutorialCache() {
  cachedManifest = null;
  cachedManifestAt = 0;
}
