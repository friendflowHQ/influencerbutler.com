/**
 * POST /api/ai-concierge/tool  { name, arguments }
 * Executes one Butler AI tool call server-side with the signed-in user's
 * identity (so account tools like get_subscription see the right user). The
 * browser round-trips realtime function calls through here, then sends the
 * result back to the model as a function_call_output.
 *
 * Dependencies: @/lib/supabase/server, @/lib/ai-concierge/agent, @/lib/mcp/auth.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { executeAgentTool } from "@/lib/ai-concierge/agent";
import type { Principal } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Dual-mode auth so voice tool-calls from the desktop app / extension (which
  // authenticate with a license-key bearer) resolve the right user, not just
  // website-cookie sessions.
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  let body: { name?: string; arguments?: Record<string, unknown> };
  try {
    body = (await request.json()) as { name?: string; arguments?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!name) return NextResponse.json({ error: "Missing tool name" }, { status: 400 });

  const principal: Principal = {
    userId: authed.auth.userId,
    email: authed.auth.email,
    source: authed.auth.kind === "license" ? "license" : "session",
  };
  try {
    const result = await executeAgentTool(name, body.arguments ?? {}, principal);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ai-concierge/tool] threw", err);
    return NextResponse.json({ result: { error: "tool failed" } });
  }
}
