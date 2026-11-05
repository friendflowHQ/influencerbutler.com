/**
 * YouTube upload copy for an event recording: an SEO title, a full description
 * (hook, what's covered, links, hashtags) and a comma-separated tags string, so
 * the admin can paste it into YouTube Studio when uploading a recording by hand
 * (for example a file from Downloads when the automatic upload failed).
 *
 * Uses the same text LLM as the event planner (Groq first, OpenAI fallback) and
 * feeds it the event title, blurb and, once the call has been recorded, the AI
 * recap (summary + key topics), so post-event copy reflects what was actually
 * covered. When no provider is configured or every call fails, a deterministic
 * template built from the same data is returned instead, so the panel always
 * has something to copy. Nothing is stored; the route returns the copy.
 *
 * Public copy only: never transcript lines or registrant data. No em or en
 * dashes (repo rule); the prompt forbids them and stripDashes() removes strays.
 */
import { DateTime } from "luxon";
import { callJson, isDraftConfigured, stripDashes } from "@/lib/event-ai-draft";
import type { EventRow } from "@/lib/events";

const SITE =
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

export type YouTubeCopy = {
  title: string;
  description: string;
  hashtags: string[];
  tags: string;
  source: "ai" | "template";
};

/** Hashtags every upload carries; the model adds topic-specific ones. */
const BASE_HASHTAGS = ["#AmazonInfluencer", "#InfluencerButler", "#AmazonInfluencerProgram"];

const BASE_TAGS = [
  "Influencer Butler",
  "Amazon influencer",
  "Amazon Influencer Program",
  "Amazon storefront",
  "Amazon affiliate",
  "Creator Connections",
  "influencer automation",
  "Amazon influencer tips",
];

const SYSTEM = [
  "You write YouTube upload metadata for Influencer Butler, automation software for",
  "Amazon (and Walmart) influencers: it runs butlers that post deals, auto-accept",
  "Creator Connections campaigns, do brand outreach, and turn storefronts and Idea",
  "Lists into commission. The video is a recording of a free live group session",
  "the Influencer Butler team hosted for creators.",
  "Write for YouTube search: lead with the words a creator would actually type",
  "(Amazon influencer, storefront, Creator Connections, the feature names in the",
  "title), in natural sentences. No keyword stuffing, no clickbait, no hype.",
  "Return ONLY a JSON object with these keys:",
  "  title       - string, under 90 characters, keyword first, readable. May end",
  "                with a short qualifier like '(Live Walkthrough)'.",
  "  hook        - string, 2 sentences. The first ~140 characters show in search",
  "                results, so put the main keywords and the payoff there.",
  "  covered     - array of 4 to 8 short strings: what the session covers, each",
  "                one line, concrete. Only things in the provided data.",
  "  whoFor      - string, one sentence on who should watch.",
  "  hashtags    - array of 3 to 6 hashtags, CamelCase, no spaces, each starting",
  "                with #, specific to the topics (feature names, niche). Do not",
  "                repeat #AmazonInfluencer or #InfluencerButler.",
  "  tags        - array of 8 to 15 YouTube tags (plain phrases, no #), mixing",
  "                broad and long-tail search phrases.",
  "Rules: never use an em dash or en dash; use a colon, comma, or hyphen instead.",
  "Do not invent timestamps, prices, guarantees, results, or speaker names.",
].join("\n");

function strArr(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => stripDashes(x).trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? stripDashes(v).trim().slice(0, max) : "";
}

function normHashtag(h: string): string | null {
  const core = h.replace(/^#+/, "").replace(/[^A-Za-z0-9]/g, "");
  return core ? `#${core}` : null;
}

function dedupeCi(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** YouTube caps the tags field at 500 characters (commas included). */
function joinTags(tags: string[]): string {
  const out: string[] = [];
  let len = 0;
  for (const t of dedupeCi(tags.map((x) => x.replace(/[<>,]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean))) {
    const add = (out.length ? 1 : 0) + t.length;
    if (len + add > 480) break;
    out.push(t);
    len += add;
  }
  return out.join(",");
}

/** Strip anything that is not plausible public event copy (cap length too). */
function eventBlurb(e: EventRow): string {
  return stripDashes((e.description || "").trim()).slice(0, 1500);
}

function whenLabel(e: EventRow): string {
  const tz = e.timezone || "America/Denver";
  const start = DateTime.fromISO(e.startsAt, { zone: tz });
  return start.isValid ? start.toFormat("LLLL d, yyyy") : "";
}

/** Assemble the final description from the parts (shared by AI and template). */
function assemble(e: EventRow, parts: { hook: string; covered: string[]; whoFor: string; hashtags: string[] }): string {
  const date = whenLabel(e);
  const lines: string[] = [];
  lines.push(parts.hook);
  if (parts.covered.length) {
    lines.push(["In this session:", ...parts.covered.map((c) => `- ${c}`)].join("\n"));
  }
  if (parts.whoFor) lines.push(parts.whoFor);
  lines.push(
    [
      "Links:",
      `- Try Influencer Butler free: ${SITE}/go/download`,
      `- Event page: ${SITE}/events/${e.id}`,
      `- Upcoming live sessions: ${SITE}/events`,
      `- Help and tutorials: ${SITE}/help`,
    ].join("\n"),
  );
  lines.push(
    `Recorded live${date ? ` on ${date}` : ""} with the Influencer Butler team. Subscribe for more Amazon influencer walkthroughs and live sessions.`,
  );
  lines.push(parts.hashtags.join(" "));
  return lines.filter(Boolean).join("\n\n").slice(0, 4900);
}

/** No-AI fallback: built only from the event's own data. */
export function templateYouTubeCopy(e: EventRow): YouTubeCopy {
  const blurb = eventBlurb(e);
  const topics = (e.aiNotes?.keyTopics ?? []).map((t) => stripDashes(t).trim()).filter(Boolean).slice(0, 8);
  const hook =
    (e.aiNotes?.summary ? stripDashes(e.aiNotes.summary).trim() : "") ||
    blurb ||
    `${e.title}: a live Influencer Butler session for Amazon influencers.`;
  const hashtags = dedupeCi(BASE_HASHTAGS);
  const title = `${stripDashes(e.title)}${e.title.length < 70 ? " (Live Walkthrough)" : ""}`.slice(0, 100);
  return {
    title,
    description: assemble(e, {
      hook,
      covered: topics,
      whoFor: "For Amazon influencers who want to save time and earn more commission from their storefront.",
      hashtags,
    }),
    hashtags,
    tags: joinTags([e.title, ...topics, ...BASE_TAGS]),
    source: "template",
  };
}

export type YouTubeCopyResult = { copy: YouTubeCopy; note: string | null };

/**
 * AI copy when a provider is configured and answers; otherwise the template,
 * with a short note saying why.
 */
export async function draftYouTubeCopy(e: EventRow): Promise<YouTubeCopyResult> {
  if (!isDraftConfigured()) {
    return { copy: templateYouTubeCopy(e), note: "No AI provider configured, so this is the basic template." };
  }
  const notes = e.aiNotes;
  const user = [
    `Event title: ${e.title}`,
    whenLabel(e) ? `Recorded: ${whenLabel(e)}` : "",
    eventBlurb(e) ? `Event description: ${eventBlurb(e)}` : "",
    notes?.summary ? `Recap of what was covered: ${stripDashes(notes.summary).slice(0, 2000)}` : "",
    notes?.keyTopics?.length ? `Key topics: ${notes.keyTopics.slice(0, 12).join("; ")}` : "",
    "",
    "Write the YouTube title, hook, covered list, whoFor, hashtags and tags now.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callJson(SYSTEM, user);
  if (!result.ok) {
    return { copy: templateYouTubeCopy(e), note: `AI draft failed (${result.reason}), showing the basic template.` };
  }
  const raw = result.data;
  const hook = str(raw.hook, 600);
  if (!hook) {
    return { copy: templateYouTubeCopy(e), note: "AI draft came back empty, showing the basic template." };
  }
  const aiTags = dedupeCi(
    strArr(raw.hashtags, 8, 40)
      .map(normHashtag)
      .filter((h): h is string => !!h),
  );
  // Topic hashtags first (YouTube shows the first three above the title), then
  // the brand ones; cap well under YouTube's 15-hashtag limit.
  const hashtags = dedupeCi([...aiTags.slice(0, 3), ...BASE_HASHTAGS, ...aiTags.slice(3)]).slice(0, 8);
  const title = str(raw.title, 100) || templateYouTubeCopy(e).title;
  return {
    copy: {
      title,
      description: assemble(e, {
        hook,
        covered: strArr(raw.covered, 8, 160),
        whoFor: str(raw.whoFor, 300),
        hashtags,
      }),
      hashtags,
      tags: joinTags([...strArr(raw.tags, 15, 60), ...BASE_TAGS]),
      source: "ai",
    },
    note: null,
  };
}
