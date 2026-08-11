/**
 * Butler AI concierge - the shared "brain" for both the voice (OpenAI Realtime)
 * and text (Groq chat) surfaces of the instant AI demo/support call.
 *
 * It reuses knowledge that already lives in the repo rather than inventing a new
 * store:
 *   - persona/instructions stay lean (Groq free-tier TPM is tight); feature and
 *     pricing facts are fetched on demand via list_features / get_pricing,
 *   - `search_help` grounds "how do I set up X" answers in the tutorial keyword
 *     index (loadSearchIndex, the same index the /help search box uses),
 *   - `list_features` / `get_pricing` / `get_earnings_summary` reuse the MCP
 *     TOOL_REGISTRY handlers.
 *
 * Dependencies: ../mcp/tools, ../mcp/feature-catalog, ../tutorials,
 * ../mcp/auth, ../scheduling-server, ../entitlements.
 */

import { callTool } from "@/lib/mcp/tools";
import type { Principal } from "@/lib/mcp/auth";
import { loadSearchIndex } from "@/lib/tutorials";
import { getAdmin } from "@/lib/scheduling-server";
import { tierForSubscriptionStatus } from "@/lib/entitlements";

export const BOOK_CALL_PATH = "/dashboard/book";
const SITE = "https://www.influencerbutler.com";
const SEARCH_RESULT_LIMIT = 4;
const MAX_HIT_IMAGES = 3;

/**
 * The desktop app's left menu, in display order, so the model can give exact
 * click paths ("In the left menu, click API Integrations"). Mirrors the nav in
 * the desktop repo's renderer/index.html; groups are hub entries that expand
 * into sub-tools. Update this list when the desktop nav changes.
 */
const DESKTOP_NAV: Array<{ label: string; items?: string[] }> = [
  { label: "Dashboard" },
  {
    label: "Amazon Butler",
    items: [
      "Message Brands", "Keywords & Filters", "Orders Butler", "Daily Commission Butler",
      "Storefront Butler", "CC Check", "Campaign Deals", "Campaign Alert Butler",
      "Brand Release Butler", "Data Refresh Butler", "Like Butler", "Goldmine Butler",
      "Earnings Intelligence", "Black Friday Butler", "Prime Day Butler",
      "Video Reload Butler", "Photo Reload Butler", "Retag Butler", "Ads Goldmine",
      "Product Research", "YouTube Butler",
    ],
  },
  {
    label: "Instagram Butler",
    items: [
      "Instagram Close Friends Butler", "Instagram Message Followers",
      "Instagram Email Collection", "Instagram Goldmine", "Instagram Like Butler",
    ],
  },
  { label: "Messenger Butler", items: ["Messages", "Templates"] },
  { label: "Collab Butler" },
  { label: "Content Butler" },
  { label: "Pitch Butler" },
  {
    label: "Deals Influencer Butler",
    items: ["Deals Influencer Butler", "Best Seller Butler", "Pricecrash Butler"],
  },
  { label: "Social Posting Butler" },
  {
    label: "Collage Butler",
    items: ["Collage Butler", "Keywords & Filters", "Collage Gallery", "Collage Templates"],
  },
  { label: "Levanta Butler", items: ["Message Brands", "Email Extractor"] },
  { label: "Action Queue" },
  { label: "Pinterest Butler" },
  { label: "Voiceover Butler" },
  {
    label: "Facebook Butler",
    items: [
      "Facebook Inviter", "Group Invite Butler", "Facebook Group Builder",
      "Facebook Message Butler", "Delete Posts & Comments",
    ],
  },
  {
    label: "Benable Butler",
    items: ["List Publishing", "Benable Like Butler", "Comment Butler"],
  },
  { label: "Link Butler", items: ["Influencer Deeplink Butler", "Relink Butler"] },
  { label: "Content Planner" },
  { label: "Sheetsyncer Butler" },
  { label: "Temu Butler" },
  { label: "API Integrations" },
  { label: "Console" },
  { label: "Feedback" },
  { label: "AI Assistant" },
  { label: "Help & Tutorials" },
  { label: "Settings" },
];

function navMapLines(): string {
  return DESKTOP_NAV.map((entry) =>
    entry.items && entry.items.length
      ? `- ${entry.label} (group): ${entry.items.join(", ")}`
      : `- ${entry.label}`,
  ).join("\n");
}

/**
 * The system prompt / persona shared by voice and text. Kept factual and short;
 * the deep how-to knowledge is fetched on demand via the search_help tool rather
 * than dumped in here.
 */
export function buildInstructions(): string {
  return [
    "You are Butler AI, the friendly on-demand concierge for Influencer Butler, a desktop app by",
    "The Social Media Posse LLC that helps Amazon creators and influencers automate Creator",
    "Connections, brand outreach, commission harvesting, deal posting, and storefront and content",
    "management. The individual tools are called \"butlers.\"",
    "",
    "Your job: give a live product demo and answer setup questions in real time, like a helpful",
    "pre-sales and onboarding specialist. Be warm, concise, and concrete. In voice mode, speak in",
    "short spoken sentences. Ask a clarifying question when the user's goal is unclear.",
    "",
    "Language:",
    "- Always reply in the language the user's own messages are written in. Match them exactly:",
    "  English question, English answer.",
    "- If you cannot tell what language the user is using (a short greeting, a product name, or",
    "  unclear audio), default to English. Never guess a language the user has not used.",
    "- Never switch languages mid-conversation unless the user switches first.",
    "- In voice mode, if you could not hear the user clearly, ask them to repeat in the language",
    "  they last spoke, or in English if they have not spoken yet.",
    "",
    "Grounding rules:",
    "- For any specific how-to, setup, or troubleshooting question, CALL the search_help tool and",
    "  base your answer on what it returns. Do not guess steps.",
    "- For pricing or plan questions, call get_pricing. For what a feature (butler) does and its",
    "  tier, call list_features.",
    "- When the signed-in user asks about their own earnings or plan, call get_earnings_summary or",
    "  get_subscription. Only share their data with them.",
    "- Never invent features, numbers, or steps. If you are not sure, say so and offer to point them",
    "  to a tutorial or book a human call.",
    "",
    "Giving directions:",
    "- When you tell the user how to do something in the desktop app, give the exact click path,",
    "  starting from the left menu. Example: In the left menu, click API Integrations. Sub-tools",
    "  live under their group hub, for example: In the left menu, open Instagram Butler, then click",
    "  Instagram Goldmine.",
    "- The desktop left menu, in order (a group lists its sub-tools):",
    navMapLines(),
    "",
    "Screenshots:",
    "- search_help results may include screenshots as images with url and alt. In text chat, when a",
    "  screenshot shows the screen you are describing, include the single most helpful one by putting",
    "  its markdown form ![alt](url) on its own line at the end of your answer. Never invent image",
    "  urls; only use urls returned by search_help.",
    "- In voice mode, never read out urls. Describe where things are in words instead.",
    "",
    "Filing feedback:",
    "- When the user reports a bug, describes something broken, or wishes for a feature that does",
    "  not exist, offer to file it with the team for them using submit_feedback.",
    "- First show a short draft: the type (bug or feature), a one line title, and a one or two",
    "  sentence description. Ask for an explicit yes. Only call submit_feedback AFTER the user",
    "  confirms. Never file without confirmation, and never file the same report twice.",
    "- After filing, confirm it was sent and that the team reads every report and replies by email.",
    "",
    "Walkthroughs:",
    "- When the user is chatting from the desktop app and asks you to set up deal posting for them,",
    "  or is struggling to configure the Deals Influencer Butler (destinations, schedule, keywords),",
    "  call start_walkthrough with tourId deals-guided-setup. It opens a wizard that asks a few",
    "  questions and writes the settings for them. Offer it proactively to strugglers.",
    "- For show-me-around requests, the other tour ids spotlight the relevant controls step by step.",
    "- On the website (no desktop app), do not call start_walkthrough; describe the steps instead.",
    "",
    "Boundaries:",
    "- You cannot access the user's Amazon or Instagram accounts and cannot click inside their",
    "  desktop app for them. Give exact click paths; they do the clicking.",
    "- No financial or investment advice. If asked, say you are not a licensed advisor.",
    "- Never name or compare against specific competitor products by name.",
    "- Do not use em-dashes. Use a colon, comma, or two sentences instead.",
    "- When you cannot help, or the user wants a person, call offer_human_call and let them know they",
    `  can book a human demo or support call at ${SITE}${BOOK_CALL_PATH}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tools (OpenAI function-calling). One canonical list, adapted to the two
// slightly different shapes the chat and realtime APIs expect.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
type AgentTool = { name: string; description: string; parameters: JsonSchema };

const NO_ARGS: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "search_help",
    description:
      "Search the Influencer Butler tutorials and help content for setup steps, how-tos, and troubleshooting. Call this for any specific 'how do I...' question and ground your answer in the results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A few keywords describing what the user wants to do." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_features",
    description: "List every Influencer Butler feature (butler) with its title, description, and tier.",
    parameters: NO_ARGS,
  },
  {
    name: "get_pricing",
    description: "Return the current pricing tiers (free, Pro monthly/annual, team, agency) and the free trial.",
    parameters: NO_ARGS,
  },
  {
    name: "get_earnings_summary",
    description: "Return the signed-in user's own affiliate earnings summary. Only use when they ask about their earnings.",
    parameters: NO_ARGS,
  },
  {
    name: "get_subscription",
    description: "Return the signed-in user's own subscription tier and plan. Only use when they ask about their plan or account.",
    parameters: NO_ARGS,
  },
  {
    name: "offer_human_call",
    description: "Signal that the user should book a human demo or support call. Returns the booking link to share.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Why a human call is being offered." } },
      additionalProperties: false,
    },
  },
  {
    name: "start_walkthrough",
    description:
      "Start a guided walkthrough inside the user's desktop app. Use tourId 'deals-guided-setup' when the user wants deal posting set up for them: it opens a wizard that asks a few questions and writes the settings (keywords, post template, destinations, schedule). The other ids spotlight the relevant controls step by step. Only useful when the user is chatting from the desktop app; on the website, describe the steps instead.",
    parameters: {
      type: "object",
      properties: {
        tourId: {
          type: "string",
          enum: [
            "deals-guided-setup",
            "deals-setup",
            "deals-harvest",
            "api-integrations",
            "deeplink-mint",
            "daily-commission-harvest",
            "feedback-report",
          ],
          description: "Which walkthrough to start.",
        },
      },
      required: ["tourId"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_feedback",
    description:
      "File a bug report or feature request with the Influencer Butler team on the user's behalf. Only call this AFTER showing the user a draft (type, title, description) in the conversation and getting an explicit yes.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bug", "feature"],
          description: "bug for something broken, feature for a request or wish.",
        },
        title: { type: "string", description: "Short one line summary, max 200 characters." },
        description: {
          type: "string",
          description: "What happened or what they want, including steps and context from the conversation.",
        },
      },
      required: ["type", "title", "description"],
      additionalProperties: false,
    },
  },
];

/** Shape for OpenAI chat/completions `tools`. */
export function toChatTools() {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Shape for the OpenAI Realtime session `tools` (flattened). */
export function toRealtimeTools() {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Tool execution (server-side, with the caller's identity)
// ---------------------------------------------------------------------------

export type HelpImage = { url: string; alt: string };
export type HelpHit = {
  id: string;
  title: string;
  summary: string;
  url: string;
  snippet: string;
  images?: HelpImage[];
};

/**
 * Rank tutorials against a query with simple term-frequency over
 * title + summary + category + body, and return the top matches with a short
 * snippet. Reuses the existing lexical index; no embeddings needed.
 */
export async function searchHelp(query: string, locale?: string): Promise<HelpHit[]> {
  const terms = (query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  const index = await loadSearchIndex(locale);
  const scored = index
    .map((e) => {
      const hay = `${e.title} ${e.summary} ${e.category} ${e.text}`.toLowerCase();
      const titleHay = `${e.title} ${e.summary}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const inBody = hay.split(term).length - 1;
        const inTitle = titleHay.split(term).length - 1;
        score += inBody + inTitle * 5; // weight title/summary hits
      }
      return { e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_RESULT_LIMIT);

  return scored.map(({ e }) => {
    const hit: HelpHit = {
      id: e.id,
      title: e.title,
      summary: e.summary,
      url: `${SITE}/help/tutorials/${e.id}`,
      snippet: snippetFor(e.text, terms),
    };
    // Screenshots come from the tutorial body ( /assets/-only, see tutorials.ts ).
    // Absolute urls so every chat surface can render them without a base.
    const images = (e.images || [])
      .slice(0, MAX_HIT_IMAGES)
      .map((img) => ({ url: `${SITE}${img.src}`, alt: img.alt }));
    if (images.length) hit.images = images;
    return hit;
  });
}

function snippetFor(text: string, terms: string[]): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 120);
  return text.slice(start, start + 320).trim();
}

async function getSubscription(principal: Principal): Promise<unknown> {
  const admin = getAdmin();
  if (!admin) return { error: "subscription lookup unavailable" };
  const { data } = await admin
    .from("subscriptions")
    .select("status,plan_name")
    .eq("user_id", principal.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const status = (data?.status as string) ?? null;
  const tier = tierForSubscriptionStatus(status);
  return { tier, status, planName: (data?.plan_name as string) ?? null };
}

/** Unwrap a mcp ToolResult (JSON-in-text) back to a plain object. */
function unwrapMcp(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

/** Client metadata the chat surfaces may send along (desktop app version etc). */
export type ClientMeta = { surface?: string; appVersion?: string; platform?: string };

const MAX_REPLY_IMAGES = 4;

/**
 * Pull ![alt](url) markdown out of the model's reply into a structured images
 * array (absolute urls, /assets/-only) and strip it from the text, so every
 * chat surface renders screenshots without a markdown parser. Non-whitelisted
 * image markdown is dropped entirely.
 */
export function extractReplyImages(reply: string): { text: string; images: HelpImage[] } {
  const images: HelpImage[] = [];
  const text = reply
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_whole, alt: string, src: string) => {
      let url = "";
      if (src.startsWith("/assets/")) url = `${SITE}${src}`;
      else if (src.startsWith(`${SITE}/assets/`)) url = src;
      if (!url) return "";
      if (images.length < MAX_REPLY_IMAGES && !images.some((i) => i.url === url)) {
        images.push({ url, alt: alt || "" });
      }
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, images };
}

/**
 * File a bug/feature report into the same Cloudflare feedback worker inbox the
 * desktop Feedback panel submits to, so chat-filed reports land in the standard
 * support triage flow. Requires FEEDBACK_SHARED_KEY (the worker's x-ib-key).
 */
async function submitFeedback(
  args: Record<string, unknown>,
  principal: Principal | null,
  client?: ClientMeta,
): Promise<unknown> {
  const sharedKey = process.env.FEEDBACK_SHARED_KEY || "";
  if (!sharedKey) {
    return { error: "Feedback filing is not configured. Point the user at the Feedback panel in the left menu instead." };
  }
  const type = args.type === "feature" ? "feature" : "bug";
  const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
  const description = typeof args.description === "string" ? args.description.trim().slice(0, 7000) : "";
  if (!title) return { error: "A title is required." };

  const base = (process.env.FEEDBACK_WORKER_URL || "https://feedback.influencerbutler.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ib-key": sharedKey },
      body: JSON.stringify({
        type,
        title,
        description: `${description}\n\n[Filed via Butler AI chat${client?.surface ? ` (${client.surface})` : ""}]`,
        userEmail: principal?.email ?? "",
        appVersion: client?.appVersion || "",
        platform: client?.platform || "concierge",
        submittedAt: new Date().toISOString(),
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string } | null;
    if (!res.ok || !json?.ok) {
      console.error("[ai-concierge] submit_feedback failed", res.status, json);
      return { error: "Could not file the report. Point the user at the Feedback panel in the left menu instead." };
    }
    return {
      ok: true,
      id: json.id ?? null,
      note: "Filed. The team reads every report and replies by email when a reply address is on the account.",
    };
  } catch (err) {
    console.error("[ai-concierge] submit_feedback threw", err);
    return { error: "Could not file the report right now. Point the user at the Feedback panel in the left menu instead." };
  }
}

/**
 * Execute one agent tool call and return a JSON-serializable result. `principal`
 * is null for anonymous callers (the account tools then return an auth message).
 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  principal: Principal | null,
  client?: ClientMeta,
): Promise<unknown> {
  switch (name) {
    case "search_help": {
      const q = typeof args.query === "string" ? args.query : "";
      return { results: await searchHelp(q) };
    }
    case "submit_feedback":
      return submitFeedback(args, principal, client);
    case "offer_human_call":
      return {
        bookUrl: `${SITE}${BOOK_CALL_PATH}`,
        note: "Offer to book a human demo or support call from the dashboard under Book a Call.",
      };
    case "start_walkthrough": {
      // The walkthrough itself runs client-side in the desktop app: the chat
      // route attaches { walkthrough: { tourId } } to the reply JSON and the
      // desktop renders a Start button (voice executes it locally). This
      // result just tells the model it worked.
      const tourId = typeof args.tourId === "string" ? args.tourId : "";
      if (!tourId) return { error: "tourId is required." };
      return {
        started: true,
        tourId,
        note: "The walkthrough opens in the desktop app. Tell the user it is starting and what it will do.",
      };
    }
    case "get_subscription":
      if (!principal) return { error: "The user is not signed in." };
      return getSubscription(principal);
    case "list_features":
    case "get_pricing":
    case "get_earnings_summary": {
      const res = await callTool(name, args, principal);
      const textPart = res.content.find((c) => c.type === "text")?.text ?? "{}";
      return res.isError ? { error: textPart } : unwrapMcp(textPart);
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}
