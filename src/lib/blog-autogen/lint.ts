/**
 * Summary: Pure lint/auto-fix pass for AI-written blog bodies. Enforces the
 *   site's markdown subset (see lib/blog-markdown renderMarkdown: flat lists,
 *   no tables, no raw HTML) and house rules (no em dashes per CLAUDE.md,
 *   images only from the approved screenshot index). Errors trigger one
 *   corrective re-prompt in the writer; warnings ride along in the summary
 *   email. No imports - unit-testable in isolation.
 */
import type { LintResult, WriterDraft } from "./types";

const EM_DASH = /\u2014/g;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Lines inside fenced code blocks are exempt from markdown-shape checks. */
function forEachProseLine(body: string, fn: (line: string, index: number) => void) {
  let inCode = false;
  body.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      inCode = !inCode;
      return;
    }
    if (!inCode) fn(line, index);
  });
}

export function lintBody(rawBody: string, allowedImagePaths: Set<string>): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- Auto-fixes ----
  let body = rawBody.replace(/\r\n/g, "\n").replace(EM_DASH, "-");

  // The article page renders the title as the h1; demote any h1 in the body.
  body = body
    .split("\n")
    .map((line) => (/^#\s+/.test(line) ? line.replace(/^#\s+/, "## ") : line))
    .join("\n");

  // Drop image lines whose path is not in the approved index (the renderer
  // would silently drop non-/assets/ images anyway; unknown /assets/ paths
  // would 404 - either way the line must go).
  const droppedImages: string[] = [];
  {
    let inCode = false;
    body = body
      .split("\n")
      .filter((line) => {
        if (line.startsWith("```")) {
          inCode = !inCode;
          return true;
        }
        if (inCode) return true;
        const img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
        if (img && !allowedImagePaths.has(img[1])) {
          droppedImages.push(img[1]);
          return false;
        }
        return true;
      })
      .join("\n");
  }
  if (droppedImages.length) {
    warnings.push(`Dropped ${droppedImages.length} image(s) not in the approved index: ${droppedImages.slice(0, 3).join(", ")}`);
  }

  body = body.replace(/\n{3,}/g, "\n\n").trim();

  // ---- Hard failures ----
  forEachProseLine(body, (line, index) => {
    const n = index + 1;
    if (/^\s*\|/.test(line)) {
      errors.push(`Line ${n}: table syntax - the blog renderer does not support tables`);
    }
    if (/<[a-z][a-z0-9-]*(\s|>|\/)/i.test(line)) {
      errors.push(`Line ${n}: raw HTML - it renders as escaped text`);
    }
    if (/^\s{2,}([-*]|\d+\.)\s/.test(line)) {
      errors.push(`Line ${n}: nested list - the renderer flattens indentation`);
    }
    if (line.includes("@youtube(")) {
      errors.push(`Line ${n}: @youtube() is a tutorials-only shortcode, not supported in blog posts`);
    }
    // Inline images mid-paragraph render, but only standalone /assets/ lines
    // are house style; check link targets everywhere.
    for (const match of line.matchAll(/(^|[^!])\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[2];
      if (!/^https?:\/\//i.test(href) && !/^\/[A-Za-z0-9]/.test(href)) {
        errors.push(`Line ${n}: link "${href.slice(0, 60)}" must be https or root-relative`);
      }
    }
  });

  const words = countWords(body);
  if (!body) {
    errors.push("Body is empty after fixes");
  } else if (words < 900) {
    errors.push(`Body too short (${words} words; need 1200-2000)`);
  } else if (words > 2600) {
    errors.push(`Body too long (${words} words; need 1200-2000)`);
  }

  // ---- Soft warnings ----
  const internalLinks = [...body.matchAll(/(^|[^!])\[[^\]]+\]\((\/[^)]*)\)/g)].length;
  if (internalLinks < 2) warnings.push(`Only ${internalLinks} internal link(s); target 2-4`);
  const images = [...body.matchAll(/^!\[[^\]]*\]\(\/assets\//gm)].length;
  if (images === 0) warnings.push("No images embedded");
  if (words >= 900 && (words < 1200 || words > 2000)) {
    warnings.push(`Word count ${words} outside the 1200-2000 target`);
  }

  return { body, errors, warnings };
}

/** Draft-level checks beyond the body (title/summary lengths etc.). */
export function lintDraft(draft: WriterDraft): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = draft.title.replace(EM_DASH, "-").trim();
  const summary = draft.summary.replace(EM_DASH, "-").trim();

  if (!title) errors.push("Missing title");
  else if (title.length > 90) errors.push(`Title too long (${title.length} chars, max 90)`);
  else if (title.length > 65) warnings.push(`Title ${title.length} chars; SEO target is <=65`);

  if (!summary) errors.push("Missing summary");
  else if (summary.length < 80) errors.push(`Summary too short (${summary.length} chars)`);
  else if (summary.length < 140 || summary.length > 160) {
    warnings.push(`Summary ${summary.length} chars; meta-description target is 140-160`);
  }

  if (!draft.keywords.trim()) errors.push("Missing keywords");
  if (!draft.imageAlt.trim()) errors.push("Missing imageAlt");
  if (!draft.imagePrompt.trim()) errors.push("Missing imagePrompt");

  return { errors, warnings };
}
