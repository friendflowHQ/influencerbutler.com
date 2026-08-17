/**
 * Summary: Assembles the grounding context for one autopilot post: product
 *   facts, the most relevant tutorials, the approved screenshot index, the
 *   internal-link pool, the do-not-duplicate list, and optional fetched
 *   research pages for timely posts. Everything is read via the GitHub API
 *   (source of truth, no fs tracing) and capped so the writer prompt stays
 *   ~60k chars.
 * Dependencies: lib/github-content, lib/blog (types), ./product-facts,
 *   ./screenshot-index, lib/blog-markdown (parseFrontmatter).
 */
import type { BlogManifestEntry } from "@/lib/blog";
import { parseFrontmatter } from "@/lib/blog-markdown";
import { getTextFile } from "@/lib/github-content";
import { PRODUCT_FACTS } from "./product-facts";
import { loadScreenshotIndex, type ScreenshotEntry } from "./screenshot-index";
import type { QueueItem } from "./types";

const TUTORIALS_MANIFEST_PATH = "content/tutorials/_index.json";
const TUTORIAL_CHAR_CAP = 6_000;
const RESEARCH_CHAR_CAP = 8_000;

export type AssembledContext = {
  screenshots: ScreenshotEntry[];
  allowedImagePaths: Set<string>;
  userMessage: string;
};

type TutorialMeta = { id: string; title: string; summary: string };

async function loadTutorialsManifest(): Promise<TutorialMeta[]> {
  const file = await getTextFile(TUTORIALS_MANIFEST_PATH);
  if (!file) return [];
  try {
    const parsed = JSON.parse(file.text) as { tutorials?: unknown };
    if (!Array.isArray(parsed.tutorials)) return [];
    return parsed.tutorials
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => ({
        id: String(t.id ?? ""),
        title: String(t.title ?? ""),
        summary: String(t.summary ?? ""),
      }))
      .filter((t) => t.id);
  } catch {
    return [];
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
}

/** Top-N tutorials by term overlap with the item's title/keywords/category. */
export function scoreTutorials(
  tutorials: TutorialMeta[],
  item: Pick<QueueItem, "title" | "keywords" | "category">,
  topN = 3,
): TutorialMeta[] {
  const terms = new Set(tokenize(`${item.title} ${item.keywords} ${item.category}`));
  return tutorials
    .map((t) => {
      const hay = tokenize(`${t.id} ${t.title} ${t.summary}`);
      let score = 0;
      for (const word of hay) if (terms.has(word)) score++;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.t);
}

async function loadTutorialBody(id: string): Promise<string | null> {
  const file = await getTextFile(`content/tutorials/${id}.en-US.mdx`);
  if (!file) return null;
  const { body } = parseFrontmatter(file.text);
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("@youtube("))
    .join("\n")
    .slice(0, TUTORIAL_CHAR_CAP);
}

/** Strip tags from fetched research HTML into readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchResearch(urls: string[]): Promise<string> {
  const sections: string[] = [];
  for (const url of urls.slice(0, 3)) {
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "InfluencerButlerBlogBot/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) {
        sections.push(`Source ${url}: fetch failed (${res.status})`);
        continue;
      }
      const text = htmlToText(await res.text()).slice(0, RESEARCH_CHAR_CAP);
      sections.push(`Source ${url}:\n${text}`);
    } catch {
      sections.push(`Source ${url}: fetch failed`);
    }
  }
  return sections.join("\n\n");
}

// Feature pages the writer can link as CTAs (served extensionless via rewrite).
const FEATURE_LINKS = [
  "/pricing - Pricing and free trial",
  "/extension - Free Chrome extension landing page",
  "/go/download - Download the desktop app",
  "/help - Help & Tutorials",
  "/course/amazon-influencer - Free 11-part Amazon Influencer course",
  "/features/daily-deals-butler - Deals Influencer Butler feature page",
  "/features/orders-butler - Orders Butler feature page",
  "/features/pitch-butler - Pitch Butler feature page",
  "/features/cc-check - CC Check feature page",
  "/features/instagram-butler - Instagram Butler feature page",
  "/features/goldmine-butler - Goldmine Butler feature page",
  "/features/storefront-butler - Storefront Butler feature page",
  "/features/collab-butler - Collab Butler feature page",
  "/features/black-friday-butler - Black Friday Butler feature page",
  "/features/prime-day-butler - Prime Day Butler feature page",
];

export async function assembleContext(
  item: QueueItem,
  manifestPosts: BlogManifestEntry[],
  campaignTheme?: string,
  campaignNotes?: string,
): Promise<AssembledContext> {
  const [tutorialsManifest, screenshots] = await Promise.all([
    loadTutorialsManifest(),
    loadScreenshotIndex(),
  ]);

  const picked = scoreTutorials(tutorialsManifest, item);
  const tutorialSections: string[] = [];
  for (const tutorial of picked) {
    const body = await loadTutorialBody(tutorial.id);
    if (body) tutorialSections.push(`### ${tutorial.title}\n${body}`);
  }

  const research = item.researchUrls?.length ? await fetchResearch(item.researchUrls) : "";

  const internalLinks = [
    ...FEATURE_LINKS,
    ...manifestPosts.slice(0, 130).map((p) => `/blog/${p.id} - ${p.title}`),
  ];

  const existingPosts = manifestPosts
    .slice(0, 130)
    .map((p) => `${p.title} | ${p.keywords}`);

  const parts = [
    "## Assignment",
    `Working title: ${item.title}`,
    item.summary ? `Summary draft: ${item.summary}` : "",
    `Target keywords: ${item.keywords}`,
    `Category: ${item.category}`,
    `Publish date: ${item.publishDate}`,
    campaignTheme ? `Campaign theme: ${campaignTheme}` : "",
    campaignNotes ? `Campaign notes: ${campaignNotes}` : "",
    item.brief ? `Topic brief: ${item.brief}` : "",
    "",
    "## Product facts (the only product claims you may make)",
    PRODUCT_FACTS,
    "",
    tutorialSections.length ? `## Relevant tutorials (accurate how-to detail)\n${tutorialSections.join("\n\n")}` : "",
    "",
    "## Approved screenshots (use ONLY these exact paths; pick 1-4 that genuinely illustrate your points)",
    screenshots.map((s) => `${s.path} - ${s.description}`).join("\n"),
    "",
    "## Internal link targets (choose 2-4)",
    internalLinks.join("\n"),
    "",
    "## Existing posts - do NOT duplicate these topics or target their keywords",
    existingPosts.join("\n"),
    research ? `\n## Research context (current information for this timely post)\n${research}` : "",
  ];

  return {
    screenshots,
    allowedImagePaths: new Set(screenshots.map((s) => s.path)),
    userMessage: parts.filter(Boolean).join("\n").slice(0, 60_000),
  };
}
