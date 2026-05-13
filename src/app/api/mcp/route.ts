import { NextResponse } from "next/server";
import { resolvePrincipal } from "@/lib/mcp/auth";
import { callTool, listToolDefinitions } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "Influencer Butler", version: "0.1.0" };

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcError = { code: number; message: string; data?: unknown };

function rpcResult(id: number | string | null | undefined, result: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { status: 200, headers: corsHeaders() },
  );
}

function rpcError(id: number | string | null | undefined, error: JsonRpcError, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error },
    { status, headers: corsHeaders() },
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  return NextResponse.json(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: PROTOCOL_VERSION,
      transport: "streamable-http",
      tools: listToolDefinitions(),
      docs: "https://www.influencerbutler.com/.well-known/mcp.json",
    },
    { status: 200, headers: corsHeaders() },
  );
}

export async function POST(request: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, { code: -32700, message: "Parse error" }, 400);
  }

  const id = body.id ?? null;
  const method = body.method;
  const params = body.params ?? {};

  if (!method) {
    return rpcError(id, { code: -32600, message: "Invalid Request: method is required" }, 400);
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Influencer Butler MCP server. Public tools: list_features, get_pricing. Auth-gated tools (Bearer ib_pat_...): create_affiliate_link, get_earnings_summary.",
      });

    case "notifications/initialized":
    case "initialized":
      return new NextResponse(null, { status: 204, headers: corsHeaders() });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: listToolDefinitions() });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!name) {
        return rpcError(id, { code: -32602, message: "params.name is required" });
      }
      const principal = await resolvePrincipal(request);
      const result = await callTool(name, args, principal);
      return rpcResult(id, result);
    }

    default:
      return rpcError(id, { code: -32601, message: `Method not found: ${method}` });
  }
}
