/**
 * Butler AI concierge - the shared "brain" for both the voice (OpenAI Realtime)
 * and text (Groq chat) surfaces of the instant AI demo/support call.
 *
 * It reuses knowledge that already lives in the repo rather than inventing a new
 * store:
 *   - persona/instructions are built from the same facts as public/llms.txt plus
 *     the curated FEATURE_CATALOG + PRICING_TIERS,
 *   - `search_help` grounds "how do I set up X" answers in the tutorial keyword
 *     index (loadSearchIndex, the same index the /help search box uses),
 *   - `list_features` / `get_pricing` / `get_earnings_summary` reuse the MCP
 *     TOOL_REGISTRY handlers.
 *
 * Dependencies: ../mcp/tools, ../mcp/feature-catalog, ../tutorials,
 * ../mcp/auth, ../scheduling-server, ../entitlements.
 */

import { FEATURE_CATALOG, PRICING_TIERS } from "@/lib/mcp/feature-catalog";
import { callTool } from "@/lib/mcp/tools";
import type { Principal } from "@/lib/mcp/auth";
import { loadSearchIndex } from "@/lib/tutorials";
import { getAdmin } from "@/lib/scheduling-server";
import { tierForSubscriptionStatus } from "@/lib/entitlements";

export const BOOK_CALL_PATH = "/dashboard/book";
const SITE = "https://www.influencerbutler.com";
const SEARCH_RESULT_LIMIT = 4;

/**
 * The system prompt / persona shared by voice and text. Kept factual and short;
 * the deep how-to knowledge is fetched on demand via the search_help tool rather
 * than dumped in here.
 */
export function buildInstructions(): string {
  const featureLines = FEATURE_CATALOG.map(
    (f) => `- ${f.title.split(":")[0].trim()} (${f.tier}): ${f.description}`,
  ).join("\n");

  return [
    "You are Butler AI, the friendly on-demand concierge for Influencer Butler, a desktop app by",
    "The Social Media Posse LLC that helps Amazon creators and influencers automate Creator",
    "Connections, brand outreach, commission harvesting, deal posting, and storefront and content",
    "management. The individual tools are called \"butlers.\"",
    "",
    "Your job: give a live product demo and answer setup questions in real time, like a helpful",
    "pre-sales and onboarding specialist. Be warm, concise, and concrete. Speak in short spoken",
    "sentences (this is a voice conversation). Ask a clarifying question when the user's goal is",
    "unclear.",
    "",
    "Grounding rules:",
    "- For any specific how-to, setup, or troubleshooting question, CALL the search_help tool and",
    "  base your answer on what it returns. Do not guess steps.",
    "- For pricing or plan questions, call get_pricing. For what a feature does, call list_features",
    "  or rely on the catalog below.",
    "- When the signed-in user asks about their own earnings or plan, call get_earnings_summary or",
    "  get_subscription. Only share their data with them.",
    "- Never invent features, numbers, or steps. If you are not sure, say so and offer to point them",
    "  to a tutorial or book a human call.",
    "",
    "Boundaries:",
    "- You cannot access the user's Amazon or Instagram accounts and cannot perform actions inside",
    "  their desktop app. You explain and walk them through steps; they do the clicking.",
    "- No financial or investment advice. If asked, say you are not a licensed advisor.",
    "- Never name or compare against specific competitor products by name.",
    "- Do not use em-dashes. Use a colon, comma, or two sentences instead.",
    "- When you cannot help, or the user wants a person, call offer_human_call and let them know they",
    `  can book a human demo or support call at ${SITE}${BOOK_CALL_PATH}.`,
    "",
    "Available butlers (name, tier, what it does):",
    featureLines,
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

export type HelpHit = { id: string; title: string; summary: string; url: string; snippet: string };

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

  return scored.map(({ e }) => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    url: `${SITE}/help/tutorials/${e.id}`,
    snippet: snippetFor(e.text, terms),
  }));
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

/**
 * Execute one agent tool call and return a JSON-serializable result. `principal`
 * is null for anonymous callers (the account tools then return an auth message).
 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  principal: Principal | null,
): Promise<unknown> {
  switch (name) {
    case "search_help": {
      const q = typeof args.query === "string" ? args.query : "";
      return { results: await searchHelp(q) };
    }
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
