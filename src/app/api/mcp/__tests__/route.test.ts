/**
 * Summary: /api/mcp tools/call rate limits by IP (unauthenticated) and by
 *   resolved user (authenticated), independently of each other.
 * Dependencies: vitest, ../route, @/lib/mcp/auth, @/lib/mcp/tools, @/lib/rate-limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp/auth", () => ({ resolvePrincipal: vi.fn() }));
vi.mock("@/lib/mcp/tools", () => ({
  callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
  listToolDefinitions: vi.fn().mockReturnValue([]),
}));

import { POST } from "../route";
import { resolvePrincipal } from "@/lib/mcp/auth";
import { __resetRateLimitMemory } from "@/lib/rate-limit";

const resolveMock = resolvePrincipal as unknown as ReturnType<typeof vi.fn>;

function callReq(ip: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_features" } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitMemory();
});

describe("POST /api/mcp tools/call", () => {
  it("rate limits an unauthenticated caller by IP after 60 calls in the window", async () => {
    resolveMock.mockResolvedValue(null);
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      lastStatus = (await POST(callReq("1.2.3.4"))).status;
    }
    expect(lastStatus).toBe(429);
  });

  it("does not rate limit a different IP after another IP was throttled", async () => {
    resolveMock.mockResolvedValue(null);
    for (let i = 0; i < 61; i++) await POST(callReq("1.2.3.4"));
    const res = await POST(callReq("5.6.7.8"));
    expect(res.status).toBe(200);
  });

  it("rate limits an authenticated caller by user id after 120 calls, across distinct IPs", async () => {
    resolveMock.mockResolvedValue({ userId: "u1", email: null, source: "api-key" });
    let lastStatus = 0;
    for (let i = 0; i < 121; i++) {
      lastStatus = (await POST(callReq(`10.0.0.${i % 250}`))).status;
    }
    expect(lastStatus).toBe(429);
  });
});
