import { NextResponse } from "next/server";
import { resolvePrincipal } from "@/lib/mcp/auth";
import { callTool } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SKILL_TO_TOOL: Record<string, string> = {
  "feature-catalog": "list_features",
  "pricing-tiers": "get_pricing",
  "amazon-affiliate-link-creation": "create_affiliate_link",
  "earnings-summary": "get_earnings_summary",
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const toolName = SKILL_TO_TOOL[id];
  if (!toolName) {
    return NextResponse.json({ error: `unknown skill: ${id}` }, { status: 404 });
  }

  let args: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      args = JSON.parse(text) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const principal = await resolvePrincipal(request);
  const result = await callTool(toolName, args, principal);

  if (result.isError) {
    return NextResponse.json({ skill: id, ...result }, { status: 400 });
  }
  return NextResponse.json({ skill: id, ...result }, { status: 200 });
}
