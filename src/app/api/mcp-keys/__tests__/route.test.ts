/**
 * Summary: /api/mcp-keys sets a default expiry on create and rate limits key
 *   creation per user.
 * Dependencies: vitest, ../route, @/lib/supabase/server, @/lib/admin,
 *   @/lib/mcp/auth, @/lib/rate-limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "../route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";
import { __resetRateLimitMemory } from "@/lib/rate-limit";

const sessionMock = createClient as unknown as ReturnType<typeof vi.fn>;
const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown = { label: "test" }) {
  return new Request("http://localhost/api/mcp-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedIn(userId: string) {
  sessionMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
  });
}

function insertCapture() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  adminMock.mockReturnValue({ from: () => ({ insert }) });
  return insert;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitMemory();
});

describe("POST /api/mcp-keys", () => {
  it("sets expires_at roughly one year out on a new key", async () => {
    signedIn("u1");
    const insert = insertCapture();
    const before = Date.now();
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { expiresAt: string };
    const expiresAt = new Date(json.expiresAt).getTime();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(before + oneYearMs - 60_000);
    expect(expiresAt).toBeLessThan(before + oneYearMs + 60_000);
    const insertedRow = insert.mock.calls[0][0] as { expires_at: string };
    expect(insertedRow.expires_at).toBe(json.expiresAt);
  });

  it("rate limits key creation per user after 5 in an hour", async () => {
    signedIn("u2");
    insertCapture();
    for (let i = 0; i < 5; i++) {
      const res = await POST(req());
      expect(res.status).toBe(200);
    }
    const sixth = await POST(req());
    expect(sixth.status).toBe(429);
  });

  it("does not let one user's key creation rate limit affect another user", async () => {
    insertCapture();
    signedIn("u3");
    for (let i = 0; i < 5; i++) await POST(req());
    signedIn("u4");
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
