/**
 * Summary: Unified site-wide search over the public marketing site. Aggregates
 *   three content sources into one searchable list and scores a query against
 *   it: blog posts (content/blog manifest), help tutorials (full plain-text
 *   body via lib/tutorials loadSearchIndex), and the homepage feature cards plus
 *   a curated set of key pages. Powers the header search dropdown (through
 *   /api/search) and the /search results page, so both share one index and one
 *   ranking. All reads are server-side and cached per locale with a short TTL.
 * Dependencies: ./blog (published posts + locale resolver), ./tutorials
 *   (per-locale search index), ./landing-features (homepage feature cards).
 */
import { loadPublishedPosts, resolveBlogLocale, type BlogLocale } from "./blog";
import { loadSearchIndex } from "./tutorials";
import { loadLandingFeatures } from "./landing-features";

export type SiteSearchType = "blog" | "help" | "feature" | "page";

// What callers get back (no internal search fields).
export type SiteSearchResult = {
  id: string;
  type: SiteSearchType;
  title: string;
  summary: string;
  category: string;
  url: string;
  image: string | null;
};

// Internal doc: a result plus the lowercased text we match against.
type SiteSearchDoc = SiteSearchResult & {
  titleLc: string;
  summaryLc: string;
  // title + summary + keywords + category + body, lowercased, for term matching.
  haystack: string;
};

// Human labels for each result type, used by the /search page and dropdown.
export const SITE_SEARCH_TYPE_LABELS: Record<SiteSearchType, string> = {
  feature: "Features",
  page: "Pages",
  help: "Help & Tutorials",
  blog: "Blog",
};

// Order sections/results appear in when scores tie. Features and key pages
// first (navigational intent), then help, then blog.
const TYPE_ORDER: Record<SiteSearchType, number> = {
  feature: 0,
  page: 1,
  help: 2,
  blog: 3,
};

// Small additive nudge so navigational content edges out an article on an
// otherwise equal score. Kept tiny so real relevance still wins.
const TYPE_WEIGHT: Record<SiteSearchType, number> = {
  page: 3,
  feature: 2,
  help: 1,
  blog: 0,
};

// Curated key pages that are not blog posts, tutorials, or homepage feature
// cards, but people still search for by name. Each carries keyword-rich text so
// a query like "affiliate", "chrome", or "price" surfaces the right page.
const CURATED_PAGES: Array<{
  id: string;
  title: string;
  summary: string;
  category: string;
  url: string;
  keywords: string;
}> = [
  {
    id: "page:pricing",
    title: "Pricing",
    summary: "Plans and pricing for Influencer Butler, including the free plan and the 14-day Pro trial.",
    category: "Pages",
    url: "/pricing",
    keywords: "pricing plans cost price subscription pro trial free tier billing how much",
  },
  {
    id: "page:extension",
    title: "Chrome Extension",
    summary: "The free Influencer Butler Chrome extension: product research and Creator Connections intel while you browse.",
    category: "Pages",
    url: "/extension",
    keywords: "chrome extension browser add-on free product research money signals",
  },
  {
    id: "page:download",
    title: "Download the App",
    summary: "Download the Influencer Butler desktop app for Windows and Mac.",
    category: "Pages",
    url: "/download",
    keywords: "download desktop app windows mac install get the app",
  },
  {
    id: "page:course",
    title: "Free Amazon Influencer Course",
    summary: "A free step-by-step course on becoming a successful Amazon influencer.",
    category: "Pages",
    url: "/course/amazon-influencer",
    keywords: "free course amazon influencer program training lessons getting started",
  },
  {
    id: "page:tools",
    title: "Free Tools",
    summary: "Free calculators and tools for Amazon and social media creators.",
    category: "Pages",
    url: "/tools",
    keywords: "free tools calculators commission rate estimator generator utilities",
  },
  {
    id: "page:affiliates",
    title: "Affiliates: Earn 30%",
    summary: "Join the affiliate program and earn 30% recurring commission for every creator you refer.",
    category: "Pages",
    url: "/affiliates",
    keywords: "affiliate program earn 30 percent referral commission partner refer a friend",
  },
  {
    id: "page:leaderboard",
    title: "Affiliate Leaderboard",
    summary: "See the top-earning Influencer Butler affiliates.",
    category: "Pages",
    url: "/leaderboard",
    keywords: "leaderboard top affiliates ranking rankings earners",
  },
  {
    id: "page:blog",
    title: "Blog",
    summary: "Practical, no-fluff guides for Amazon, Benable, daily deals, and Instagram creators.",
    category: "Pages",
    url: "/blog",
    keywords: "blog articles guides tips tactics posts",
  },
  {
    id: "page:help",
    title: "Help & Tutorials",
    summary: "Step-by-step setup and how-to guides for every Influencer Butler workspace.",
    category: "Pages",
    url: "/help",
    keywords: "help tutorials support how to setup guides docs documentation faq",
  },
  {
    id: "page:contact",
    title: "Contact Us",
    summary: "Get in touch with the Influencer Butler team.",
    category: "Pages",
    url: "/contact",
    keywords: "contact support email help talk to a human get in touch",
  },
  {
    id: "page:about",
    title: "About",
    summary: "The story behind Influencer Butler and the team building it.",
    category: "Pages",
    url: "/about",
    keywords: "about story team founder liz who we are company",
  },
];

// Turn a homepage feature-card href into a real destination. Cards link either
// to a page (/extension), an on-page anchor (#pricing), or occasionally nothing.
function normalizeHref(href: string): string {
  const h = (href || "").trim();
  if (!h || h === "#") return "/#features";
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith("#")) return `/${h}`;
  if (h.startsWith("/")) return h;
  return `/${h}`;
}

function makeDoc(input: {
  id: string;
  type: SiteSearchType;
  title: string;
  summary: string;
  category: string;
  url: string;
  image?: string | null;
  extra?: string;
}): SiteSearchDoc {
  const { id, type, title, summary, category, url } = input;
  const image = input.image ?? null;
  const extra = input.extra ?? "";
  const haystack = `${title} ${summary} ${category} ${extra}`.toLowerCase();
  return {
    id,
    type,
    title,
    summary,
    category,
    url,
    image,
    titleLc: title.toLowerCase(),
    summaryLc: summary.toLowerCase(),
    haystack,
  };
}

const indexCache = new Map<BlogLocale, { docs: SiteSearchDoc[]; at: number }>();
const INDEX_CACHE_MS = 30_000;

// Build (or reuse) the unified index for one locale. Blog and page entries are
// English-only today, but tutorials and the locale key are honored so the index
// tracks the visitor's language where translations exist.
async function loadIndex(requestedLocale?: string): Promise<SiteSearchDoc[]> {
  const locale = resolveBlogLocale(requestedLocale);
  const cached = indexCache.get(locale);
  if (cached && Date.now() - cached.at < INDEX_CACHE_MS) return cached.docs;

  const docs: SiteSearchDoc[] = [];

  // Blog: match on the keyword-rich manifest metadata (title + summary +
  // keywords + category) rather than reading 100+ article bodies per build.
  try {
    const posts = await loadPublishedPosts();
    for (const p of posts) {
      docs.push(
        makeDoc({
          id: `blog:${p.id}`,
          type: "blog",
          title: p.title,
          summary: p.summary,
          category: p.category || "Blog",
          url: `/blog/${p.id}`,
          image: p.image || null,
          extra: p.keywords || "",
        }),
      );
    }
  } catch {
    // Blog is optional; skip if the manifest can't be read.
  }

  // Help tutorials: full plain-text body is already in the tutorials index.
  try {
    const tutorials = await loadSearchIndex(locale);
    for (const t of tutorials) {
      docs.push(
        makeDoc({
          id: `help:${t.id}`,
          type: "help",
          title: t.title,
          summary: t.summary,
          category: t.category || "Help",
          url: `/help/tutorials/${t.id}`,
          image: t.images?.[0]?.src || null,
          extra: t.text,
        }),
      );
    }
  } catch {
    // Tutorials optional.
  }

  // Homepage feature cards.
  try {
    const features = await loadLandingFeatures();
    const seen = new Set<string>();
    for (const c of features.cards) {
      const url = normalizeHref(c.href);
      const key = `${c.title}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      docs.push(
        makeDoc({
          id: `feature:${url}:${c.title}`,
          type: "feature",
          title: c.title,
          summary: c.description,
          category: c.category || "Feature",
          url,
          image: null,
        }),
      );
    }
  } catch {
    // Features optional.
  }

  // Curated key pages.
  for (const pg of CURATED_PAGES) {
    docs.push(
      makeDoc({
        id: pg.id,
        type: "page",
        title: pg.title,
        summary: pg.summary,
        category: pg.category,
        url: pg.url,
        extra: pg.keywords,
      }),
    );
  }

  indexCache.set(locale, { docs, at: Date.now() });
  return docs;
}

/**
 * Rank the index against a query. AND semantics: every whitespace-delimited
 * term must appear somewhere in a doc, then matches are scored with a strong
 * bias toward title hits and exact phrase matches, and a small nudge by type so
 * navigational pages edge out articles on an otherwise equal score.
 */
export function scoreDocs(
  docs: SiteSearchDoc[],
  query: string,
  limit = 8,
): SiteSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: Array<{ doc: SiteSearchDoc; score: number }> = [];
  for (const doc of docs) {
    if (!terms.every((t) => doc.haystack.includes(t))) continue;

    let score = TYPE_WEIGHT[doc.type];
    for (const t of terms) {
      if (doc.titleLc.includes(t)) score += 6;
      if (doc.titleLc.startsWith(t)) score += 4;
      if (doc.summaryLc.includes(t)) score += 2;
    }
    // Exact phrase bonuses reward "orders butler" over two scattered words.
    if (terms.length > 1) {
      if (doc.titleLc.includes(q)) score += 20;
      else if (doc.summaryLc.includes(q)) score += 6;
    }
    if (doc.titleLc === q) score += 40;

    scored.push({ doc, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byType = TYPE_ORDER[a.doc.type] - TYPE_ORDER[b.doc.type];
    if (byType !== 0) return byType;
    return a.doc.title.localeCompare(b.doc.title);
  });

  return scored.slice(0, Math.max(1, limit)).map(stripDoc);
}

function stripDoc(entry: { doc: SiteSearchDoc }): SiteSearchResult {
  const { id, type, title, summary, category, url, image } = entry.doc;
  return { id, type, title, summary, category, url, image };
}

/**
 * Convenience wrapper: load the index for a locale and rank a query against it.
 * Used by both the /api/search route and the /search results page.
 */
export async function searchSite(
  query: string,
  opts: { locale?: string; limit?: number } = {},
): Promise<SiteSearchResult[]> {
  if (!query || query.trim().length === 0) return [];
  const docs = await loadIndex(opts.locale);
  return scoreDocs(docs, query, opts.limit ?? 8);
}

// Test/dev hook to drop the cached index.
export function clearSiteSearchCache() {
  indexCache.clear();
}
