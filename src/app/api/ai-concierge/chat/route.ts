/**
 * POST /api/ai-concierge/chat  { messages: [{role,content}], client? }
 * Text-mode Butler AI turn. Prepends the persona, runs a chat/completions loop
 * that executes tool calls server-side (with the signed-in user's identity), and
 * returns { reply, images } where images are tutorial screenshots the model
 * referenced (extracted from markdown, /assets/-only). Uses the cheap
 * Groq/OpenAI resolver, so typing costs a fraction of a cent while voice uses
 * the metered Realtime API.
 *
 * Auth is dual-mode (resolveAuth): the website session cookie OR a license-key
 * bearer, so the desktop app + Chrome extension share this one concierge route.
 * Dependencies: @/lib/license-auth, @/lib/ai-concierge/{agent,llm}, @/lib/mcp/auth.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { buildInstructions, toChatTools, executeAgentTool, extractReplyImages, sanitizeWalkthroughArgs } from "@/lib/ai-concierge/agent";
import type { ClientMeta, WalkthroughPayload } from "@/lib/ai-concierge/agent";
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";
import type { TextProvider } from "@/lib/ai-concierge/llm";
import type { Principal } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMsg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Choice = { message: { content: string | null; tool_calls?: ToolCall[] } };

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 24;

function sanitizeClient(raw: unknown): ClientMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const pick = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const personaRaw = c.persona && typeof c.persona === "object" ? (c.persona as Record<string, unknown>) : null;
  const persona = personaRaw
    ? { butlerName: pick(personaRaw.butlerName, 60), firstName: pick(personaRaw.firstName, 60) }
    : null;
  return {
    surface: pick(c.surface, 40),
    appVersion: pick(c.appVersion, 40),
    platform: pick(c.platform, 40),
    ...(persona && (persona.butlerName || persona.firstName) ? { persona } : {}),
  };
}

export async function POST(request: Request) {
  const provider = resolveTextProvider();
  if (!provider) return NextResponse.json({ error: "Text concierge is not configured yet." }, { status: 503 });

  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  let body: { messages?: ChatMsg[]; client?: unknown };
  try {
    body = (await request.json()) as { messages?: ChatMsg[]; client?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  const client = sanitizeClient(body.client);

  const principal: Principal = {
    userId: authed.auth.userId,
    email: authed.auth.email,
    source: authed.auth.kind === "license" ? "license" : "session",
  };
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildInstructions(client?.persona) },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) })),
  ];

  const callProvider = (p: TextProvider) =>
    fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.4,
        messages,
        tools: toChatTools(),
        tool_choice: "auto",
      }),
    });

  // Groq's free tier is flaky mid-conversation: a tokens-per-minute 429, or a
  // transient 5xx/timeout on any tool round, can surface to the user as
  // "assistant unavailable". When that happens, fail the whole conversation
  // over to OpenAI (sticky for the remaining rounds) instead of erroring out.
  let activeProvider = provider;
  // A start_walkthrough tool call's payload is forwarded to the desktop with
  // the final reply (the executor only acks). First call wins; desktop only.
  let walkthrough: WalkthroughPayload | null = null;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let res = await callProvider(activeProvider);
      // Fail over on ANY non-OK Groq response (429, 5xx, gateway timeouts), not
      // just the tokens-per-minute 429 — a passing Groq hiccup should retry on
      // OpenAI rather than reach the user as "unavailable". No-op when Groq is
      // the only configured provider (openAiFallbackProvider returns null).
      if (!res.ok && activeProvider.kind === "groq") {
        const fallback = openAiFallbackProvider();
        if (fallback) {
          console.warn(`[ai-concierge/chat] groq ${res.status}, failing over to openai`);
          activeProvider = fallback;
          res = await callProvider(activeProvider);
        }
      }
      if (!res.ok) {
        console.error("[ai-concierge/chat]", res.status, await res.text().catch(() => ""));
        return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
      }
      const json = (await res.json()) as { choices?: Choice[] };
      const choice = json.choices?.[0]?.message;
      if (!choice) return NextResponse.json({ error: "No reply." }, { status: 502 });

      if (choice.tool_calls?.length) {
        // Record the assistant's tool-call turn, then execute each tool.
        messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const call of choice.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
          if (call.function.name === "start_walkthrough" && !walkthrough && client?.surface === "desktop") {
            walkthrough = sanitizeWalkthroughArgs(args);
          }
          const result = await executeAgentTool(call.function.name, args, principal, client);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
        continue; // loop for the model to use the tool results
      }

      const { text, images } = extractReplyImages(choice.content ?? "");
      return NextResponse.json(walkthrough ? { reply: text, images, walkthrough } : { reply: text, images });
    }
    return NextResponse.json(
      walkthrough
        ? { reply: "The walkthrough is ready. Follow the Next buttons on screen.", images: [], walkthrough }
        : { reply: "I ran into a loop working that out. Could you rephrase, or book a human call?", images: [] },
    );
  } catch (err) {
    console.error("[ai-concierge/chat] threw", err);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
