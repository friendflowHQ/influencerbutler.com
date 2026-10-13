// Pure helpers for the blog inline-link pass (scripts/link-blog-posts.mjs).
//
// Given a post body (Markdown, frontmatter already stripped) and the shared link
// targets (content/blog/_link-targets.json), wrap the FIRST natural mention of a
// target phrase in a Markdown link. Rules that keep the result safe and idempotent:
//   - only plain prose lines: never headings, quotes, tables, code, images, HTML
//   - never inside an existing link, inline code, HTML tag, or bare URL
//   - skip a target the post already links to (so re-running adds nothing)
//   - at most `maxLinks` new links per post, and at most `kindCaps[kind]` per kind
//   - targets with more topical hits in the post win the limited slots

const PROTECTED = /(\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>|https?:\/\/\S+)/g;

export const DEFAULT_KIND_CAPS = { feature: 2, guide: 1, tool: 1, extension: 1, course: 1 };

/** True for lines whose text we are allowed to link inside. */
export function isProseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^(#{1,6}\s|>|\||!\[|<|---|```|~~~)/.test(t)) return false;
  return true;
}

/** Hrefs (path or absolute) the Markdown already links to. */
export function existingHrefs(body) {
  const hrefs = new Set();
  for (const m of body.matchAll(/\]\(([^)\s]+)/g)) {
    const raw = m[1].replace(/^https?:\/\/(?:www\.)?influencerbutler\.com/i, "");
    hrefs.add(raw.split(/[?#]/)[0].replace(/\/$/, "") || "/");
  }
  return hrefs;
}

function compile(sources, flags = "i") {
  const out = [];
  for (const s of sources ?? []) {
    try {
      out.push(new RegExp(s, flags));
    } catch {
      // A bad pattern in the JSON should not take the whole pass down.
    }
  }
  return out;
}

/** How many times a target's broad `match` patterns hit the body (relevance score). */
export function topicalHits(body, target) {
  let n = 0;
  for (const re of compile(target.match, "gi")) {
    const found = body.match(re);
    if (found) n += found.length;
  }
  return n;
}

// Find the first inline-phrase match inside eligible prose. Returns
// { lineIndex, start, end } in terms of the line string, or null.
function findInlineMatch(lines, inlineRes, avoidLineRe) {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !isProseLine(line)) continue;
    if (avoidLineRe && avoidLineRe.test(line)) continue;

    const parts = line.split(PROTECTED);
    let offset = 0;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      if (p % 2 === 0) {
        for (const re of inlineRes) {
          const m = re.exec(part);
          if (m && m[0].length > 0) {
            return { lineIndex: i, start: offset + m.index, end: offset + m.index + m[0].length };
          }
        }
      }
      offset += part.length;
    }
  }
  return null;
}

/**
 * @param {string} body Markdown body
 * @param {Array} targets entries of _link-targets.json `targets`
 * @param {{maxLinks?: number, kindCaps?: Record<string, number>, category?: string}} [opts]
 * @returns {{ body: string, added: { href: string, text: string }[] }}
 */
export function applyInlineLinks(body, targets, opts = {}) {
  const maxLinks = opts.maxLinks ?? 3;
  const kindCaps = { ...DEFAULT_KIND_CAPS, ...(opts.kindCaps ?? {}) };
  const already = existingHrefs(body);
  const category = (opts.category ?? "").trim().toLowerCase();

  // Rank candidates by topical relevance so the limited slots go to what the post
  // is actually about; file order breaks ties.
  const candidates = targets
    .map((t, order) => ({ t, order, hits: topicalHits(body, t) }))
    .filter(({ t, hits }) => hits > 0 && (t.inline?.length ?? 0) > 0 && !already.has(t.href))
    .sort((a, b) => b.hits - a.hits || a.order - b.order);

  const lines = body.split("\n");
  const added = [];
  const perKind = {};

  // Links to target pages the post already carries (from an earlier run or by
  // hand) count against the cap, so re-running never keeps adding more.
  for (const t of targets) {
    if (already.has(t.href)) perKind[t.kind] = (perKind[t.kind] ?? 0) + 1;
  }
  const existingTotal = Object.values(perKind).reduce((a, b) => a + b, 0);

  for (const { t } of candidates) {
    if (existingTotal + added.length >= maxLinks) break;
    const cap = kindCaps[t.kind] ?? 1;
    if ((perKind[t.kind] ?? 0) >= cap) continue;

    // Some product names are used loosely in a few posts (for example "Like
    // Butler" in Instagram posts, where the Instagram product is a different
    // one). Skip those posts and lines rather than link a claim the page contradicts.
    if (category && (t.avoidCategories ?? []).includes(category)) continue;
    const avoidLineRe = t.avoidLine ? new RegExp(t.avoidLine, "i") : null;

    const hit = findInlineMatch(lines, compile(t.inline, ""), avoidLineRe);
    if (!hit) continue;

    const line = lines[hit.lineIndex];
    const text = line.slice(hit.start, hit.end);
    lines[hit.lineIndex] = `${line.slice(0, hit.start)}[${text}](${t.href})${line.slice(hit.end)}`;
    added.push({ href: t.href, text });
    perKind[t.kind] = (perKind[t.kind] ?? 0) + 1;
  }

  return { body: lines.join("\n"), added };
}
