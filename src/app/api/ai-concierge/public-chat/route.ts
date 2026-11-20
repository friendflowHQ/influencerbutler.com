/**
 * POST /api/ai-concierge/public-chat  { messages: [{role,content}], locale? }
 * Butler AI for logged-out visitors on the public site (pricing, help). Same
 * brain and failover as /api/ai-concierge/chat, but locked down because anyone on
 * the internet can call it:
 *   - only read-only product tools (help search, features, pricing, what's new);
 *     no account, earnings, booking, ticket or template tools;
 *   - short history and short messages, no screenshots;
 *   - strict per-IP limits plus a site-wide hourly ceiling so a script cannot run
 *     up the LLM bill; over a limit returns 429 with a friendly message.
 * Replies carry a "Read the full guide" source list like the signed-in chat.
 *
 * Dependencies: @/lib/ai-concierge/{agent,llm}, @/lib/rate-limit, @/lib/client-ip.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { buildInstructions, toChatTools, executeAgentTool, extractReplyImages, normalizeChatLocale } from "@/lib/ai-concierge/agent";
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";
import type { TextProvider } from "@/lib/ai-concierge/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMsg = { role: "user" | "assistant"; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Choice = { message: { content: string | null; tool_calls?: ToolCall[] } };
type SourceLink = { title: string; url: string };

const ALLOWED_TOOLS = new Set(["search_help", "list_features", "get_pricing", "get_whats_new"]);
const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY = 8;
const MAX_MESSAGE_CHARS = 600;
const IP_LIMIT = 10;
const IP_WINDOW_SEC = 600;
const IP_DAILY_LIMIT = 40;
const IP_DAILY_WINDOW_SEC = 86_400;
const SITE_LIMIT = 600;
const SITE_WINDOW_SEC = 3600;

const PUBLIC_ADDENDUM = [
  "You are talking to a visitor on the public website who is NOT signed in. Rules for this chat:",
  "- You have no access to any account, plan, earnings, bookings or settings. Never claim to look anything up for them.",
  "- Answer questions about what Influencer Butler does, how it works, pricing and plans, and how to get started, using your tools. Be brief (a few short sentences).",
  "- When it fits, invite them to start the free trial at https://www.influencerbutler.com/signup. Do not push it on every message.",
  "- To talk to a person, send them to https://www.influencerbutler.com/contact. Do not offer to book a call or file a ticket from here.",
  "- If they need help with their own account or a bug, tell them to sign in (https://www.influencerbutler.com/login) and use the chat in the dashboard, or use the contact page.",
].join("\n");

function publicTools() {
  return toChatTools([]).filter((t) => ALLOWED_TOOLS.has(t.function.name));
}

function sourcesFrom(result: unknown): SourceLink[] {
  const found = result as { results?: Array<{ title?: unknown; url?: unknown }>; confidence?: string } | null;
  if (found?.confidence && found.confidence !== "ok") return [];
  const out: SourceLink[] = [];
  for (const h of found?.results ?? []) {
    if (typeof h?.title !== "string" || typeof h?.url !== "string") continue;
    if (!h.url.startsWith("https://www.influencerbutler.com/help/")) continue;
    out.push({ title: h.title.slice(0, 120), url: h.url });
    if (out.length >= 2) break;
  }
  return out;
}

export async function POST(request: Request) {
  const provider = resolveTextProvider();
  if (!provider) return NextResponse.json({ error: "Chat is not available right now." }, { status: 503 });

  const ip = clientIp(request);
  const [burst, daily, site] = await Promise.all([
    rateLimit(`ai-public-chat:ip:${ip}`, IP_LIMIT, IP_WINDOW_SEC),
    rateLimit(`ai-public-chat:ip-day:${ip}`, IP_DAILY_LIMIT, IP_DAILY_WINDOW_SEC),
    rateLimit("ai-public-chat:site", SITE_LIMIT, SITE_WINDOW_SEC),
  ]);
  if (!burst.allowed || !daily.allowed || !site.allowed) {
    return NextResponse.json(
      { error: "Our chat is busy right now. Please try again in a few minutes, or use the contact page." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfterSec ?? IP_WINDOW_SEC) } },
    );
  }

  let body: { messages?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const history: ChatMsg[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is ChatMsg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  if (!history.length || history[history.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "Send a question to get started." }, { status: 400 });
  }

  const client = { surface: "website-public", locale: normalizeChatLocale(body.locale) };
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: `${buildInstructions(undefined, [], undefined)}\n\n${PUBLIC_ADDENDUM}` },
    ...history,
  ];
  const tools = publicTools();
  const callProvider = (p: TextProvider) =>
    fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: p.model, temperature: 0.3, messages, tools, tool_choice: "auto", max_tokens: 500 }),
    });

  let active = provider;
  let sources: SourceLink[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let res = await callProvider(active);
      if (!res.ok && active.kind === "groq") {
        const fallback = openAiFallbackProvider();
        if (fallback) {
          active = fallback;
          res = await callProvider(active);
        }
      }
      if (!res.ok) {
        console.error("[ai-concierge/public-chat]", res.status, await res.text().catch(() => ""));
        return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
      }
      const json = (await res.json()) as { choices?: Choice[] };
      const choice = json.choices?.[0]?.message;
      if (!choice) return NextResponse.json({ error: "No reply." }, { status: 502 });

      if (choice.tool_calls?.length) {
        messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const call of choice.tool_calls) {
          if (!ALLOWED_TOOLS.has(call.function.name)) {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "That is not available to visitors." }) });
            continue;
          }
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
          const result = await executeAgentTool(call.function.name, args, null, client);
          if (call.function.name === "search_help") {
            const found = sourcesFrom(result);
            if (found.length) sources = found;
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
        }
        continue;
      }

      // Visitors get text and guide links only, never screenshots or cards.
      const { text } = extractReplyImages(choice.content ?? "");
      return NextResponse.json({ reply: text, ...(sources.length ? { sources } : {}) });
    }
    return NextResponse.json({
      reply: "I could not work that out. Please try rephrasing, or use our contact page and a person will help.",
    });
  } catch (err) {
    console.error("[ai-concierge/public-chat] threw", err);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
