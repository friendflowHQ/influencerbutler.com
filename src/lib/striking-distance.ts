// "Striking distance" keywords: queries the site already ranks for on the edge of
// page 1 or on page 2 (average position ~4 to 20). Small on-page improvements move
// these the fastest, because Google already considers the page relevant.
//
// Pure functions only (no I/O) so the ranking, the suggested action, and the
// week-over-week diff are unit-tested. The Search Console fetch lives in
// src/lib/gsc.ts; the dashboard panel lives in
// src/app/dashboard/admin/growth/SearchSection.tsx.

export type QueryPageRow = {
  query: string;
  /** Full URL as Search Console reports it. */
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type PageKind = "home" | "blog" | "feature" | "tool" | "guide" | "course" | "compare" | "other";

export type StrikingRow = {
  query: string;
  /** Path of the page that earns the most impressions for this query. */
  page: string;
  pageKind: PageKind;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Impression-weighted average position across every page that ranked. */
  position: number;
  /** Extra clicks per 28 days if the query reached position 3. */
  potentialClicks: number;
  action: string;
  /** Set when a weekly snapshot exists: position last week (null = not listed then). */
  prevPosition?: number | null;
  /** True when a snapshot exists and this query was not on it. */
  isNew?: boolean;
};

export type StrikingSnapshot = {
  takenAt: string;
  rows: { query: string; position: number; impressions: number; clicks: number }[];
};

/** app_config key holding the weekly snapshot used for week-over-week movement. */
export const STRIKING_SNAPSHOT_KEY = "growth_gsc_striking_weekly";

export const MIN_POSITION = 4;
export const MAX_POSITION = 20;
export const TARGET_POSITION = 3;
export const DEFAULT_MIN_IMPRESSIONS = 5;
export const DEFAULT_LIMIT = 25;

// Rough organic CTR by average position (industry-style curve; the exact numbers
// matter less than the shape). Linearly interpolated between whole positions.
const CTR_CURVE: Record<number, number> = {
  1: 0.28,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.065,
  6: 0.05,
  7: 0.04,
  8: 0.032,
  9: 0.028,
  10: 0.024,
  11: 0.018,
  12: 0.015,
  13: 0.013,
  14: 0.011,
  15: 0.01,
  16: 0.009,
  17: 0.008,
  18: 0.007,
  19: 0.006,
  20: 0.005,
};

export function benchmarkCtr(position: number): number {
  if (!Number.isFinite(position) || position <= 1) return CTR_CURVE[1];
  if (position >= 20) return CTR_CURVE[20];
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  if (lo === hi) return CTR_CURVE[lo];
  const t = position - lo;
  return CTR_CURVE[lo] * (1 - t) + CTR_CURVE[hi] * t;
}

// Brand queries already rank #1 and are not an SEO opportunity.
export function isBrandQuery(query: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  return q.includes("influencerbutler") || q.includes("influencerbutlerai");
}

export function toPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url.split(/[?#]/)[0] || url;
  }
}

export function pageKindOf(path: string): PageKind {
  if (path === "/" || path === "") return "home";
  if (path.startsWith("/blog")) return "blog";
  if (path.startsWith("/features")) return "feature";
  if (path.startsWith("/tools")) return "tool";
  if (path.startsWith("/guides") || path.startsWith("/best-")) return "guide";
  if (path.startsWith("/course")) return "course";
  if (path.startsWith("/compare")) return "compare";
  return "other";
}

const KIND_LABEL: Record<PageKind, string> = {
  home: "homepage",
  blog: "blog post",
  feature: "feature page",
  tool: "free tool",
  guide: "guide",
  course: "course page",
  compare: "comparison page",
  other: "page",
};

export function kindLabel(kind: PageKind): string {
  return KIND_LABEL[kind];
}

// One concrete next step per row, chosen from where it ranks and how it performs.
export function suggestAction(row: {
  position: number;
  ctr: number;
  impressions: number;
  pageKind: PageKind;
}): string {
  const noun = KIND_LABEL[row.pageKind];
  const underperformsCtr = row.position <= 10 && row.ctr < benchmarkCtr(row.position) * 0.6;
  if (row.position <= 10) {
    if (underperformsCtr && row.impressions >= 20) {
      return `Rewrite the ${noun} title and meta description to lead with the exact phrase; the page is seen but not clicked.`;
    }
    return `Put the exact phrase in the ${noun} title, H1 and first paragraph, add a short FAQ answering it, and link to it from 2 to 3 related posts.`;
  }
  if (row.pageKind === "blog" || row.pageKind === "home" || row.pageKind === "other") {
    return "Page 2: give this phrase its own section or a dedicated page, then link to it from related posts and the matching feature page.";
  }
  return `Page 2: expand the ${noun} with a section that answers this phrase directly, add an FAQ entry, and link to it from related blog posts.`;
}

type Acc = {
  impressions: number;
  clicks: number;
  weightedPosition: number;
  pages: Map<string, number>;
};

/**
 * Collapse query+page rows into one row per query, keep the ones sitting between
 * positions 4 and 20, and rank by the clicks that moving to position 3 would add.
 */
export function buildStrikingDistance(
  rows: QueryPageRow[],
  opts: { minImpressions?: number; limit?: number } = {},
): StrikingRow[] {
  const minImpressions = opts.minImpressions ?? DEFAULT_MIN_IMPRESSIONS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const byQuery = new Map<string, Acc>();
  for (const r of rows) {
    const query = r.query.trim().toLowerCase();
    if (!query || isBrandQuery(query)) continue;
    if (!(r.impressions > 0)) continue;
    const acc = byQuery.get(query) ?? {
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      pages: new Map<string, number>(),
    };
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.weightedPosition += r.position * r.impressions;
    const path = toPath(r.page);
    acc.pages.set(path, (acc.pages.get(path) ?? 0) + r.impressions);
    byQuery.set(query, acc);
  }

  const out: StrikingRow[] = [];
  for (const [query, acc] of byQuery) {
    if (acc.impressions < minImpressions) continue;
    const position = acc.weightedPosition / acc.impressions;
    if (position < MIN_POSITION || position > MAX_POSITION) continue;

    let page = "/";
    let best = -1;
    for (const [p, impr] of acc.pages) {
      if (impr > best) {
        best = impr;
        page = p;
      }
    }
    const pageKind = pageKindOf(page);
    const ctr = acc.clicks / acc.impressions;
    const potentialClicks = Math.max(
      0,
      acc.impressions * (benchmarkCtr(TARGET_POSITION) - benchmarkCtr(position)),
    );
    out.push({
      query,
      page,
      pageKind,
      clicks: Math.round(acc.clicks),
      impressions: Math.round(acc.impressions),
      ctr,
      position,
      potentialClicks,
      action: suggestAction({ position, ctr, impressions: acc.impressions, pageKind }),
    });
  }

  out.sort(
    (a, b) =>
      b.potentialClicks - a.potentialClicks ||
      b.impressions - a.impressions ||
      a.query.localeCompare(b.query),
  );
  return out.slice(0, limit);
}

export function toSnapshot(rows: StrikingRow[], takenAt = new Date().toISOString()): StrikingSnapshot {
  return {
    takenAt,
    rows: rows.map((r) => ({
      query: r.query,
      position: Math.round(r.position * 10) / 10,
      impressions: r.impressions,
      clicks: r.clicks,
    })),
  };
}

/** Annotate live rows with last week's position (and flag new arrivals). */
export function applySnapshot(rows: StrikingRow[], snapshot: StrikingSnapshot | null): StrikingRow[] {
  if (!snapshot || !Array.isArray(snapshot.rows)) return rows;
  const prev = new Map(snapshot.rows.map((r) => [r.query, r.position]));
  return rows.map((r) => {
    const was = prev.get(r.query);
    return was === undefined
      ? { ...r, prevPosition: null, isNew: true }
      : { ...r, prevPosition: was, isNew: false };
  });
}
