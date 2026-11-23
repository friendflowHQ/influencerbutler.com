/**
 * Summary: Unit tests for /api/me/setup-snapshot. POST stores only the cleaned,
 *   bounded snapshot (never a secret), needs a license or session, and tells the
 *   app to retry (503) when the table is not applied. GET answers the booking
 *   page per checklist item without ever returning the raw snapshot.
 * Dependencies: vitest, ../route, @/lib/license-auth, @/lib/scheduling-server, @/lib/setup-snapshot-server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/license-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/scheduling-server", () => ({ getAdmin: vi.fn() }));
const readMock = vi.fn();
const saveMock = vi.fn();
vi.mock("@/lib/setup-snapshot-server", () => ({
  readSetupSnapshot: (...a: unknown[]) => readMock(...a),
  saveSetupSnapshot: (...a: unknown[]) => saveMock(...a),
}));

import { GET, POST } from "../route";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin } from "@/lib/scheduling-server";

const authMock = resolveAuth as unknown as ReturnType<typeof vi.fn>;
const adminMock = getAdmin as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown, raw?: string) =>
  new Request("http://localhost/api/me/setup-snapshot", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer IB-KEY" }, body: raw ?? JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ ok: true, auth: { userId: "user-1", email: "a@b.co" } });
  adminMock.mockReturnValue({});
  saveMock.mockResolvedValue(true);
});

describe("POST", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.mockResolvedValue({ ok: false, status: 401, error: "Sign in required" });
    expect((await POST(post({}))).status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("stores the cleaned snapshot for the caller's own user id", async () => {
    const res = await POST(post({ snapshot: { butlers: { deals: { done: 0, total: 1, missing: [{ id: "destinations", label: "Turn on a place to post me@example.com", secret: "x" }] } }, apiKey: "sk-proj-ABCDEF1234567890abcdef1234567890" } }));
    expect(res.status).toBe(200);
    const [, userId, stored] = saveMock.mock.calls[0];
    expect(userId).toBe("user-1");
    const blob = JSON.stringify(stored);
    expect(blob).not.toMatch(/example\.com|sk-proj|secret|apiKey/);
    expect(stored.butlers.deals.missing[0].id).toBe("destinations");
  });

  it("rejects junk, bad JSON and oversized bodies", async () => {
    expect((await POST(post({ snapshot: { butlers: {} } }))).status).toBe(400);
    expect((await POST(post(null, "not json"))).status).toBe(400);
    expect((await POST(post(null, "x".repeat(70 * 1024)))).status).toBe(413);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the table is not applied so the app retries later", async () => {
    saveMock.mockResolvedValue(false);
    expect((await POST(post({ snapshot: { butlers: { deals: { done: 1, total: 1, missing: [] } } } }))).status).toBe(503);
  });
});

describe("GET", () => {
  const get = (q: string) => new Request(`http://localhost/api/me/setup-snapshot?${q}`);

  it("returns per-item state and never the raw snapshot", async () => {
    readMock.mockResolvedValue({
      updatedAt: new Date().toISOString(),
      snapshot: { v: 1, at: new Date().toISOString(), requiredDone: 0, requiredTotal: 1, line: "", butlers: { "ai-clone-butler": { done: 0, total: 1, missing: [{ id: "openai", label: "Connect your OpenAI key" }] } } },
    });
    const j = await (await GET(get("type=support&topics=ai-influencer"))).json();
    expect(j.hasSnapshot).toBe(true);
    const key = j.items.find((i: { prereqId: string }) => i.prereqId === "ai-influencer.key");
    expect(key.state).toBe("missing");
    expect(key.missing[0].label).toBe("Connect your OpenAI key");
    expect(j.snapshot).toBeUndefined();
    expect(j.butlers).toBeUndefined();
  });

  it("is all unknown for an install that never synced", async () => {
    readMock.mockResolvedValue(null);
    const j = await (await GET(get("topics=deals-butler"))).json();
    expect(j.hasSnapshot).toBe(false);
    expect(j.items.every((i: { state: string }) => i.state === "unknown")).toBe(true);
  });
});
