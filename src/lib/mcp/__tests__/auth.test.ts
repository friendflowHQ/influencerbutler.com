/**
 * Summary: resolvePrincipal rejects revoked and expired keys, and stamps
 *   last_used_at on a successful lookup.
 * Dependencies: vitest, ../auth, @/lib/admin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin", () => ({ createAdminClient: vi.fn() }));

import { resolvePrincipal, hashApiKey } from "../auth";
import { createAdminClient } from "@/lib/admin";

const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const TOKEN = "ib_pat_abcdefghijklmnopqrstuvwx";

function req(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/mcp", { headers });
}

function mockAdmin(keyRow: Record<string, unknown> | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const maybeSingleKey = vi.fn().mockResolvedValue({ data: keyRow, error: null });
  const maybeSingleProfile = vi.fn().mockResolvedValue({ data: { email: "me@example.com" }, error: null });
  adminMock.mockReturnValue({
    from: (table: string) => {
      if (table === "mcp_api_keys") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: maybeSingleKey }) }),
          update,
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: maybeSingleProfile }) }) };
    },
  });
  return { update };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePrincipal", () => {
  it("returns null without a bearer token", async () => {
    expect(await resolvePrincipal(req())).toBeNull();
  });

  it("rejects a revoked key", async () => {
    mockAdmin({ id: "k1", user_id: "u1", revoked_at: new Date().toISOString(), expires_at: null });
    expect(await resolvePrincipal(req(`Bearer ${TOKEN}`))).toBeNull();
  });

  it("rejects an expired key", async () => {
    mockAdmin({
      id: "k1",
      user_id: "u1",
      revoked_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await resolvePrincipal(req(`Bearer ${TOKEN}`))).toBeNull();
  });

  it("accepts a valid, unexpired key and stamps last_used_at", async () => {
    const { update } = mockAdmin({
      id: "k1",
      user_id: "u1",
      revoked_at: null,
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });
    const principal = await resolvePrincipal(req(`Bearer ${TOKEN}`));
    expect(principal).toEqual({ userId: "u1", email: "me@example.com", source: "api-key" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_used_at: expect.any(String) }));
  });

  it("accepts a key with no expiry set (legacy row)", async () => {
    mockAdmin({ id: "k1", user_id: "u1", revoked_at: null, expires_at: null });
    const principal = await resolvePrincipal(req(`Bearer ${TOKEN}`));
    expect(principal?.userId).toBe("u1");
  });

  it("hashApiKey is deterministic sha256 hex", () => {
    expect(hashApiKey("x")).toBe(hashApiKey("x"));
    expect(hashApiKey("x")).toMatch(/^[a-f0-9]{64}$/);
  });
});
