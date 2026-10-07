/**
 * Summary: /api/affiliates/notify needs a session, ignores body text, and is
 *   rate limited.
 * Dependencies: vitest, ../route, @/lib/supabase/server, @/lib/email-send.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn() }));

import { POST } from "../route";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email-send";
import { __resetRateLimitMemory } from "@/lib/rate-limit";

const sessionMock = createClient as unknown as ReturnType<typeof vi.fn>;
const sendMock = sendEmail as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/affiliates/notify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

function session(user: { id: string; email: string } | null, app: Record<string, unknown> | null) {
  sessionMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: "x" } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: app, error: null }) }) }) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitMemory();
  process.env.RESEND_API_KEY = "re_test";
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
  sendMock.mockResolvedValue({ ok: true });
});

describe("/api/affiliates/notify", () => {
  it("rejects unauthenticated callers", async () => {
    session(null, null);
    const res = await POST(req({ fullName: "Evil\nBcc: x", email: "a@b.co" }));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("emails only session / DB-derived values, never body text", async () => {
    session({ id: "u1", email: "real@example.com" }, { full_name: "Real Person\nInjected", email: "real@example.com" });
    const res = await POST(req({ fullName: "ATTACKER PHISH TEXT", email: "evil@evil.com", userId: "other" }));
    expect(res.status).toBe(200);
    const text = String(sendMock.mock.calls[0][0].text);
    expect(text).not.toContain("ATTACKER");
    expect(text).not.toContain("evil.com");
    expect(text).toContain("User ID: u1");
    expect(text).not.toMatch(/Real Person\nInjected/);
  });

  it("rate limits repeat calls per user", async () => {
    session({ id: "u1", email: "real@example.com" }, { full_name: "Real", email: "real@example.com" });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await POST(req({}))).status);
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[4]).toBe(429);
  });
});
