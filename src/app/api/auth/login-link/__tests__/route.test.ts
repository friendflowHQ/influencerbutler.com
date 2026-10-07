/**
 * Summary: /api/auth/login-link requires Turnstile, is rate limited per IP and
 *   per email, and the email carries anti-phishing language.
 * Dependencies: vitest, ../route, @/lib/admin-service, @/lib/email-send, @/lib/turnstile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-service", () => ({ adminService: vi.fn() }));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-senders", () => ({ transactionalFrom: () => "IB <hello@influencerbutler.com>" }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));

import { POST } from "../route";
import { adminService } from "@/lib/admin-service";
import { sendEmail } from "@/lib/email-send";
import { verifyTurnstile } from "@/lib/turnstile";
import { __resetRateLimitMemory } from "@/lib/rate-limit";

const svcMock = adminService as unknown as ReturnType<typeof vi.fn>;
const sendMock = sendEmail as unknown as ReturnType<typeof vi.fn>;
const turnstileMock = verifyTurnstile as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown, ip = "9.9.9.9") {
  return new Request("http://localhost/api/auth/login-link", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function fakeSvc() {
  return {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already registered" } }),
        generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: "abc" } }, error: null }),
      },
    },
    from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitMemory();
  turnstileMock.mockResolvedValue({ ok: true });
  svcMock.mockReturnValue(fakeSvc());
  sendMock.mockResolvedValue({ ok: true });
});

describe("/api/auth/login-link", () => {
  it("rejects when Turnstile fails and sends nothing", async () => {
    turnstileMock.mockResolvedValue({ ok: false, reason: "missing_token" });
    const res = await POST(req({ email: "a@b.co", mode: "signin" }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
    expect(svcMock).not.toHaveBeenCalled();
  });

  it("includes anti-phishing language in the email", async () => {
    const res = await POST(req({ email: "a@b.co", mode: "signin" }));
    expect(res.status).toBe(200);
    const text = String(sendMock.mock.calls[0][0].text);
    expect(text).toMatch(/only send sign-in links from influencerbutler\.com/);
    expect(text).toMatch(/never ask for your password or license key by email/i);
  });

  it("limits repeat requests for one email (3 per hour)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await POST(req({ email: "victim@b.co", mode: "signin" }, `1.1.1.${i}`))).status);
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[3]).toBe(429);
  });

  it("limits one IP across many emails (10 per hour)", async () => {
    let limited = 0;
    for (let i = 0; i < 14; i++) {
      const res = await POST(req({ email: `u${i}@b.co`, mode: "signin" }, "5.5.5.5"));
      if (res.status === 429) limited++;
    }
    expect(limited).toBe(4);
  });
});
