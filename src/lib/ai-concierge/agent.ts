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
 * into sub-tools. Each item carries its data-section key in [brackets] in the
 * rendered map: the start_walkthrough tool's `steps[].section` must use those
 * keys. Update this list when the desktop nav changes.
 */
type NavLeaf = { label: string; key: string };
const DESKTOP_NAV: Array<{ label: string; key?: string; items?: NavLeaf[] }> = [
  { label: "Dashboard", key: "dashboard" },
  {
    label: "Amazon Butler",
    items: [
      { label: "Message Brands", key: "outreach" },
      { label: "Keywords & Filters", key: "ai-keyword-generator" },
      { label: "Orders Butler", key: "orders-butler" },
      { label: "Daily Commission Butler", key: "harvest" },
      { label: "Storefront Butler", key: "storefrontbutler" },
      { label: "CC Check", key: "cc-check" },
      { label: "Campaign Deals", key: "cc-deals" },
      { label: "Campaign Alert Butler", key: "campaign-alert-butler" },
      { label: "Brand Release Butler", key: "brand-release-butler" },
      { label: "Data Refresh Butler", key: "data-refresh-butler" },
      { label: "Like Butler", key: "like-butler" },
      { label: "Goldmine Butler", key: "goldmine-butler" },
      { label: "Earnings Intelligence", key: "earnings-intelligence" },
      { label: "Black Friday Butler", key: "black-friday" },
      { label: "Prime Day Butler", key: "prime-day-butler" },
      { label: "Video Reload Butler", key: "video-reload-butler" },
      { label: "Photo Reload Butler", key: "photo-reload-butler" },
      { label: "Retag Butler", key: "retag-butler" },
      { label: "Ads Goldmine", key: "ads-goldmine" },
      { label: "Product Research", key: "product-research" },
      { label: "YouTube Butler", key: "youtube-butler" },
    ],
  },
  {
    label: "Instagram Butler",
    items: [
      { label: "Instagram Close Friends Butler", key: "closefriends-butler" },
      { label: "Instagram Message Followers", key: "instagram-outreach" },
      { label: "Instagram Email Collection", key: "instagram-email" },
      { label: "Instagram Goldmine", key: "instagram-goldmine" },
      { label: "Instagram Like Butler", key: "instagram-like-butler" },
    ],
  },
  {
    label: "Messenger Butler",
    items: [
      { label: "Messages", key: "messenger" },
      { label: "Templates", key: "messenger-templates" },
    ],
  },
  { label: "Collab Butler", key: "collab" },
  { label: "Content Butler", key: "content-butler" },
  { label: "Pitch Butler", key: "pitchbutler" },
  {
    label: "Deals Influencer Butler",
    items: [
      { label: "Deals Influencer Butler", key: "daily-deals" },
      { label: "Best Seller Butler", key: "best-seller-butler" },
      { label: "Pricecrash Butler", key: "pricecrash-butler" },
    ],
  },
  { label: "Social Posting Butler", key: "social-posting-butler" },
  {
    label: "Collage Butler",
    items: [
      { label: "Collage Butler", key: "collage-butler" },
      { label: "Keywords & Filters", key: "collage-keywords" },
      { label: "Collage Gallery", key: "collage-gallery" },
      { label: "Collage Templates", key: "collage-templates" },
    ],
  },
  {
    label: "Levanta Butler",
    items: [
      { label: "Message Brands", key: "levanta-message-brands" },
      { label: "Email Extractor", key: "levanta-email-extractor" },
    ],
  },
  { label: "Action Queue", key: "action-queue" },
  { label: "Pinterest Butler", key: "pinterest-butler" },
  { label: "Voiceover Butler", key: "voiceover-butler" },
  {
    label: "Facebook Butler",
    items: [
      { label: "Facebook Inviter", key: "facebook-influencer" },
      { label: "Group Invite Butler", key: "group-invite-butler" },
      { label: "Facebook Group Builder", key: "facebook-group-builder" },
      { label: "Facebook Message Butler", key: "facebook-message-butler" },
      { label: "Delete Posts & Comments", key: "delete-posts-comments" },
    ],
  },
  {
    label: "Benable Butler",
    items: [
      { label: "List Publishing", key: "benable-butler" },
      { label: "Benable Like Butler", key: "benable-like-butler" },
      { label: "Comment Butler", key: "benable-comment-butler" },
    ],
  },
  {
    label: "Link Butler",
    items: [
      { label: "Influencer Deeplink Butler", key: "link-butler" },
      { label: "Relink Butler", key: "relink-butler" },
    ],
  },
  { label: "Content Planner", key: "content-planner" },
  { label: "Sheetsyncer Butler", key: "google-sheets-export" },
  { label: "Temu Butler", key: "temu" },
  { label: "API Integrations", key: "api-integrations" },
  { label: "Console", key: "audit" },
  { label: "Feedback", key: "feedback" },
  { label: "AI Assistant", key: "ai-assistant" },
  { label: "Help & Tutorials", key: "help" },
  { label: "Settings", key: "settings" },
];

function navMapLines(): string {
  const leaf = (l: { label: string; key?: string }) =>
    l.key ? `${l.label} [${l.key}]` : l.label;
  return DESKTOP_NAV.map((entry) =>
    entry.items && entry.items.length
      ? `- ${entry.label} (group): ${entry.items.map(leaf).join(", ")}`
      : `- ${leaf(entry)}`,
  ).join("\n");
}

/**
 * Curated desktop walkthrough tours (defined in the desktop repo's
 * renderer/hud/assistant-tours.js). The model prefers one of these ids;
 * anything else falls back to AI-composed section steps.
 */
const WALKTHROUGH_TOURS: Array<{ id: string; about: string }> = [
  { id: "deals-setup", about: "Deals Influencer Butler filters, post builder, destinations, scheduler" },
  { id: "deals-harvest", about: "Deals Influencer Butler deal harvest and send" },
  { id: "api-integrations", about: "API Integrations and DeepLink Routing setup" },
  { id: "deeplink-mint", about: "Mint a short Butler Link in Link Butler" },
  { id: "daily-commission-harvest", about: "Daily Commission Butler run and schedule" },
  { id: "feedback-report", about: "Send feedback from the Feedback panel" },
];

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
    "Guided walkthroughs (desktop app only):",
    "- When the desktop app user asks how to do something, for a demo, or for a walkthrough, offer",
    "  to guide them on screen and call start_walkthrough. The app then navigates to each screen and",
    "  highlights the control while they click Next. Also give a one or two sentence text answer.",
    `- Prefer a curated tour when one matches: ${WALKTHROUGH_TOURS.map((t) => `${t.id} (${t.about})`).join("; ")}.`,
    "- Otherwise compose up to 8 short steps yourself. Each step needs section (a [key] from the",
    "  menu map above), a short title, and one sentence of body text.",
    "- Never offer or call start_walkthrough for website or extension users; give written steps.",
    "",
    "Filing feedback:",
    "- When the user reports a bug, describes something broken, or wishes for a feature that does",
    "  not exist, offer to file it with the team for them using submit_feedback.",
    "- First show a short draft: the type (bug or feature), a one line title, and a one or two",
    "  sentence description. Ask for an explicit yes. Only call submit_feedback AFTER the user",
    "  confirms. Never file without confirmation, and never file the same report twice.",
    "- After filing, confirm it was sent and that the team reads every report and replies by email.",
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
      "Start an on-screen guided walkthrough in the DESKTOP app: it navigates to each screen and highlights the control while the user clicks Next/Back. Desktop app users only. Pass a curated tourId when one matches the topic; otherwise pass steps composed from the menu map's [section keys].",
    parameters: {
      type: "object",
      properties: {
        tourId: {
          type: "string",
          enum: ["deals-setup", "deals-harvest", "api-integrations", "deeplink-mint", "daily-commission-harvest", "feedback-report"],
          description: "A curated tour id. Preferred when the topic matches.",
        },
        steps: {
          type: "array",
          maxItems: 8,
          description: "Fallback when no curated tour fits: short section-level steps.",
          items: {
            type: "object",
            properties: {
              section: { type: "string", description: "A [section key] from the left-menu map." },
              title: { type: "string", description: "Short step title." },
              body: { type: "string", description: "One sentence telling the user what to do here." },
            },
            required: ["section", "title", "body"],
            additionalProperties: false,
          },
        },
      },
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

/**
 * Validated start_walkthrough payload. The desktop resolves tourId against its
 * curated registry; steps are AI-composed section-level fallbacks. Shared by
 * the tool executor (ack) and the chat route (which forwards the payload to
 * the desktop in the response).
 */
export type WalkthroughPayload =
  | { tourId: string }
  | { steps: Array<{ section: string; title: string; body: string; target?: string }> };

export function sanitizeWalkthroughArgs(raw: unknown): WalkthroughPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.tourId === "string" && a.tourId.trim()) {
    return { tourId: a.tourId.trim().slice(0, 60) };
  }
  if (Array.isArray(a.steps)) {
    const steps: Array<{ section: string; title: string; body: string; target?: string }> = [];
    for (const s of a.steps as Array<Record<string, unknown>>) {
      if (!s || typeof s !== "object") continue;
      const section = typeof s.section === "string" ? s.section.trim().slice(0, 60) : "";
      const title = typeof s.title === "string" ? s.title.slice(0, 120) : "";
      const body = typeof s.body === "string" ? s.body.slice(0, 500) : "";
      if (!section || (!title && !body)) continue;
      const step: { section: string; title: string; body: string; target?: string } = { section, title, body };
      if (typeof s.target === "string" && s.target.trim()) step.target = s.target.slice(0, 200);
      steps.push(step);
      if (steps.length >= 8) break;
    }
    if (steps.length) return { steps };
  }
  return null;
}

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
    case "start_walkthrough": {
      if (client?.surface !== "desktop") {
        return { error: "Guided walkthroughs only work in the desktop app. Give written steps instead." };
      }
      const payload = sanitizeWalkthroughArgs(args);
      if (!payload) return { error: "No usable walkthrough steps. Give written steps instead." };
      // The chat route forwards the payload to the desktop; this ack is what
      // the model narrates over.
      return { ok: true, note: "The walkthrough will start on the user's screen. Tell them to follow the Next buttons." };
    }
    case "submit_feedback":
      return submitFeedback(args, principal, client);
    case "offer_human_call":
      return {
        bookUrl: `${SITE}${BOOK_CALL_PATH}`,
        note: "Offer to book a human demo or support call from the dashboard under Book a Call.",
      };
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
