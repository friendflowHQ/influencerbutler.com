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
import { buildInstructions, toChatTools, executeAgentTool, extractReplyImages } from "@/lib/ai-concierge/agent";
import type { ClientMeta } from "@/lib/ai-concierge/agent";
import { resolveTextProvider } from "@/lib/ai-concierge/llm";
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
  return {
    surface: pick(c.surface, 40),
    appVersion: pick(c.appVersion, 40),
    platform: pick(c.platform, 40),
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
    { role: "system", content: buildInstructions() },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) })),
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.4,
          messages,
          tools: toChatTools(),
          tool_choice: "auto",
        }),
      });
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
          const result = await executeAgentTool(call.function.name, args, principal, client);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
        continue; // loop for the model to use the tool results
      }

      const { text, images } = extractReplyImages(choice.content ?? "");
      return NextResponse.json({ reply: text, images });
    }
    return NextResponse.json({ reply: "I ran into a loop working that out. Could you rephrase, or book a human call?", images: [] });
  } catch (err) {
    console.error("[ai-concierge/chat] threw", err);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
