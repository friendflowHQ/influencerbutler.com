/**
 * Summary: Picks the "Tools and guides for this topic" links shown under every
 *   blog post: feature pages, free tools, guides, the course and the extension that
 *   match what the post is about. Pure and data-driven from
 *   content/blog/_link-targets.json (the same file the inline-link script uses), so
 *   it works for every locale and every future post with no per-post editing.
 * Dependencies: content/blog/_link-targets.json
 */
import targetsFile from "../../content/blog/_link-targets.json";

export type LinkKind = "feature" | "tool" | "guide" | "course" | "extension";

export type LinkTarget = {
  href: string;
  kind: LinkKind;
  label: string;
  blurb: string;
  match: string[];
  inline: string[];
};

export type Resource = Pick<LinkTarget, "href" | "kind" | "label" | "blurb">;

type TargetsFile = { fallbacks: string[]; targets: LinkTarget[] };

const FILE = targetsFile as unknown as TargetsFile;

export const LINK_TARGETS: LinkTarget[] = FILE.targets;
const FALLBACKS: string[] = FILE.fallbacks;

const MAX_BODY_HITS = 6;
const HEAD_WEIGHT = 4;
// One stray mention in a long post is not a topic; need a headline hit or repeated body hits.
const MIN_SCORE = 2;

function compile(sources: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const s of sources) {
    try {
      out.push(new RegExp(s, "gi"));
    } catch {
      // A bad pattern in the JSON must not break page rendering.
    }
  }
  return out;
}

function countHits(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    const found = text.match(re);
    if (found) n += found.length;
  }
  return n;
}

/** Same-site hrefs the Markdown body already links to, normalized to a path. */
export function linkedPaths(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/\]\(([^)\s]+)/g)) {
    const raw = m[1].replace(/^https?:\/\/(?:www\.)?influencerbutler\.com/i, "");
    out.add(raw.split(/[?#]/)[0].replace(/\/$/, "") || "/");
  }
  return out;
}

export type ResourceInput = {
  title: string;
  summary?: string;
  keywords?: string;
  category?: string;
  /** Markdown body (frontmatter already stripped). */
  body: string;
};

/**
 * Up to `max` resources ranked by how strongly the post talks about each one.
 * Title, summary and keywords weigh more than body mentions. Pages the post
 * already links to are left out so the block adds something new. The list is
 * topped up to at least three with the evergreen fallbacks (course, free tools,
 * extension, download), and always includes a non-feature resource (tool, guide,
 * course or extension) when one is relevant.
 */
export function pickResources(
  input: ResourceInput,
  opts: { max?: number; targets?: LinkTarget[]; fallbacks?: string[] } = {},
): Resource[] {
  const max = opts.max ?? 4;
  const targets = opts.targets ?? LINK_TARGETS;
  const fallbacks = opts.fallbacks ?? FALLBACKS;
  const already = linkedPaths(input.body);
  const head = [input.title, input.summary ?? "", input.keywords ?? ""].join(" \n ");

  const scored = targets
    .map((t, order) => {
      const patterns = compile(t.match);
      const score =
        countHits(head, patterns) * HEAD_WEIGHT + Math.min(countHits(input.body, patterns), MAX_BODY_HITS);
      return { t, order, score };
    })
    .filter((s) => s.score >= MIN_SCORE && !already.has(s.t.href))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  let chosen = scored.slice(0, max).map((s) => s.t);

  const isFeature = (t: LinkTarget) => t.kind === "feature";
  if (chosen.length > 0 && chosen.every(isFeature)) {
    const bestOther = scored.find((s) => !isFeature(s.t));
    if (bestOther && !chosen.includes(bestOther.t)) {
      chosen = [...chosen.slice(0, Math.max(0, max - 1)), bestOther.t];
    }
  }

  const have = new Set(chosen.map((t) => t.href));
  for (const href of fallbacks) {
    if (chosen.length >= Math.min(3, max)) break;
    if (have.has(href) || already.has(href)) continue;
    const t = targets.find((x) => x.href === href);
    if (!t) continue;
    chosen.push(t);
    have.add(href);
  }

  return chosen.slice(0, max).map(({ href, kind, label, blurb }) => ({ href, kind, label, blurb }));
}
