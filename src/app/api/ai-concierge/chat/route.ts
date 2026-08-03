/**
 * POST /api/ai-concierge/chat  { messages: [{role,content}] }
 * Text-mode Butler AI turn. Prepends the persona, runs a chat/completions loop
 * that executes tool calls server-side (with the signed-in user's identity), and
 * returns the assistant's reply. Uses the cheap Groq/OpenAI resolver, so typing
 * costs a fraction of a cent while voice uses the metered Realtime API.
 *
 * Dependencies: @/lib/supabase/server, @/lib/ai-concierge/{agent,llm},
 * @/lib/mcp/auth.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildInstructions, toChatTools, executeAgentTool } from "@/lib/ai-concierge/agent";
import { resolveTextProvider } from "@/lib/ai-concierge/llm";
import type { Principal } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMsg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Choice = { message: { content: string | null; tool_calls?: ToolCall[] } };

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 24;

export async function POST(request: Request) {
  const provider = resolveTextProvider();
  if (!provider) return NextResponse.json({ error: "Text concierge is not configured yet." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { messages?: ChatMsg[] };
  try {
    body = (await request.json()) as { messages?: ChatMsg[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];

  const principal: Principal = { userId: user.id, email: user.email ?? null, source: "session" };
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
          const result = await executeAgentTool(call.function.name, args, principal);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
        continue; // loop for the model to use the tool results
      }

      return NextResponse.json({ reply: choice.content ?? "" });
    }
    return NextResponse.json({ reply: "I ran into a loop working that out. Could you rephrase, or book a human call?" });
  } catch (err) {
    console.error("[ai-concierge/chat] threw", err);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
