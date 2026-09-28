/**
 * Summary: Pure Markdown/frontmatter helpers for blog content, extracted from
 *   lib/blog.ts so they can run in both server routes and "use client"
 *   components (the admin blog editor's live preview). No Node imports here:
 *   lib/blog.ts pulls in node:fs and cannot be bundled client-side.
 *   Also home to the serializers (serializeFrontmatter/buildMdxFile) the admin
 *   editor uses to write MDX files that parseFrontmatter reads back verbatim.
 * Dependencies: none.
 */

export function escapeHtml(value: string): string {
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

export function parseFrontmatter(source: string): { frontmatter: Record<string, unknown>; body: string } {
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

export function renderInline(line: string): string {
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
export function renderMarkdown(source: string): string {
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

// Frontmatter keys in the order every existing blog MDX file writes them.
// Pin fields (pinImage/pinDescription) live only in the manifest, not in
// frontmatter, matching all committed posts.
export const FRONTMATTER_KEY_ORDER = [
  "title",
  "summary",
  "category",
  "date",
  "author",
  "readingTime",
  "keywords",
  "image",
  "imageAlt",
] as const;

// Serialize frontmatter the exact way parseFrontmatter reads it back: flat,
// one `key: value` line per field, values unquoted (the parser's greedy `.*`
// handles colons in values). The only characters that would break the format
// are newlines, so they are collapsed to spaces.
export function serializeFrontmatter(fields: Record<string, string | undefined>): string {
  const lines: string[] = ["---"];
  const emitted = new Set<string>();
  const push = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    const clean = value.replace(/[\r\n]+/g, " ").trim();
    if (!clean) return;
    lines.push(`${key}: ${clean}`);
    emitted.add(key);
  };
  for (const key of FRONTMATTER_KEY_ORDER) push(key, fields[key]);
  // Any extra fields (defensive; none expected today) follow the fixed keys.
  for (const [key, value] of Object.entries(fields)) {
    if (!emitted.has(key) && /^[A-Za-z0-9_-]+$/.test(key)) push(key, value);
  }
  lines.push("---");
  return lines.join("\n");
}

// Full MDX file contents: frontmatter block, blank line, trimmed body, final
// newline. Round-trip contract: parseFrontmatter(buildMdxFile(f, b)) returns
// f and b unchanged (module tests in the admin routes rely on this).
export function buildMdxFile(fields: Record<string, string | undefined>, body: string): string {
  return `${serializeFrontmatter(fields)}\n\n${body.trim()}\n`;
}
