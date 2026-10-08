/**
 * Summary: Unit tests for /api/build-week/enter - the launch flag, honeypot,
 *   validation (consent, email, Facebook idea link), Turnstile and rate limits,
 *   the stored row (consent wording + Rules version), duplicate and missing-table
 *   handling, and the separate event-updates opt-in (never for a suppressed address).
 * Dependencies: vitest, ../route and the libs it calls (mocked).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email-unsubscribe", () => ({ isEmailSuppressed: vi.fn() }));
vi.mock("@/lib/email-marketing", () => ({ tagRecipientsAsContacts: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { POST } from "../route";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import {
  BUILD_WEEK_CONSENT_TEXT,
  BUILD_WEEK_RULES_VERSION,
  BUILD_WEEK_SLUG,
  BUILD_WEEK_SOURCE,
  BUILD_WEEK_TAG,
} from "@/lib/build-week";

const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const suppressedMock = isEmailSuppressed as unknown as ReturnType<typeof vi.fn>;
const tagMock = tagRecipientsAsContacts as unknown as ReturnType<typeof vi.fn>;
const turnstileMock = verifyTurnstile as unknown as ReturnType<typeof vi.fn>;
const rateMock = rateLimit as unknown as ReturnType<typeof vi.fn>;

const IDEA = "https://www.facebook.com/groups/influencerbutler/posts/123/?comment_id=456";

function request(body: unknown) {
  return new Request("http://localhost/api/build-week/enter", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function valid(extra: Record<string, unknown> = {}) {
  return {
    name: "Serina Smith",
    email: "Serina@Gmail.com",
    ideaUrl: IDEA,
    agree: true,
    turnstileToken: "tok",
    ...extra,
  };
}

function fakeDb(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from }, from, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_BUILD_WEEK_ENABLED", "1");
  turnstileMock.mockResolvedValue({ ok: true });
  rateMock.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  suppressedMock.mockResolvedValue(false);
  tagMock.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/build-week/enter", () => {
  it("returns 404 and touches nothing until the launch flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_WEEK_ENABLED", "");
    const res = await POST(request(valid()));
    expect(res.status).toBe(404);
    expect(adminMock).not.toHaveBeenCalled();
    expect(turnstileMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    expect((await POST(request("{nope"))).status).toBe(400);
  });

  it("drops honeypot submissions silently with 200", async () => {
    const res = await POST(request(valid({ website: "http://spam" })));
    expect(res.status).toBe(200);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("requires a name, a valid email and the consent box", async () => {
    expect((await POST(request(valid({ name: "  " })))).status).toBe(400);
    expect((await POST(request(valid({ email: "nope" })))).status).toBe(400);
    const noConsent = await POST(request(valid({ agree: false })));
    expect(noConsent.status).toBe(400);
    expect((await noConsent.json()).error).toMatch(/Official Rules/);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("requires an idea link or a description, and the link must be a Facebook https link", async () => {
    expect((await POST(request(valid({ ideaUrl: "" })))).status).toBe(400);
    expect((await POST(request(valid({ ideaUrl: "http://facebook.com/x" })))).status).toBe(400);
    expect((await POST(request(valid({ ideaUrl: "https://evil.example.com/facebook.com" })))).status).toBe(400);
    expect((await POST(request(valid({ ideaUrl: "not a url" })))).status).toBe(400);
    const db = fakeDb();
    adminMock.mockReturnValue(db.client);
    const described = await POST(request(valid({ ideaUrl: "", ideaSummary: "A butler that does X" })));
    expect(described.status).toBe(200);
  });

  it("rejects a reserved test address", async () => {
    const res = await POST(request(valid({ email: "me@example.com" })));
    expect(res.status).toBe(400);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("fails when Turnstile rejects the visitor", async () => {
    turnstileMock.mockResolvedValue({ ok: false, reason: "rejected" });
    const res = await POST(request(valid()));
    expect(res.status).toBe(400);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    rateMock.mockResolvedValueOnce({ allowed: false, retryAfterSec: 120 });
    rateMock.mockResolvedValueOnce({ allowed: true, retryAfterSec: 0 });
    const res = await POST(request(valid()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("saves the entry with the consent record and a lowercased email", async () => {
    const db = fakeDb();
    adminMock.mockReturnValue(db.client);
    const res = await POST(request(valid({ groupName: "Serina S", keepPrivate: true })));
    expect(res.status).toBe(200);
    expect(db.from).toHaveBeenCalledWith("build_week_entries");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0]).toMatchObject({
      event_slug: BUILD_WEEK_SLUG,
      name: "Serina Smith",
      email: "serina@gmail.com",
      group_name: "Serina S",
      idea_url: IDEA,
      keep_private: true,
      wants_updates: false,
      rules_version: BUILD_WEEK_RULES_VERSION,
      consent_text: BUILD_WEEK_CONSENT_TEXT,
    });
    // No event-updates opt-in: never tagged or enrolled.
    expect(tagMock).not.toHaveBeenCalled();
  });

  it("notes the language the consent was shown in", async () => {
    const db = fakeDb();
    adminMock.mockReturnValue(db.client);
    await POST(request(valid({ locale: "es-ES" })));
    expect(db.insert.mock.calls[0][0].consent_text).toBe(
      `${BUILD_WEEK_CONSENT_TEXT} [shown to the entrant in es-ES; the English Rules control]`,
    );
    await POST(request(valid({ locale: "xx-XX", email: "other@gmail.com" })));
    expect(db.insert.mock.calls[1][0].consent_text).toBe(BUILD_WEEK_CONSENT_TEXT);
  });

  it("keys the rate limits by IP and by email", async () => {
    adminMock.mockReturnValue(fakeDb().client);
    await POST(request(valid()));
    const keys = rateMock.mock.calls.map((c) => c[0]);
    expect(keys).toContain("build-week:ip:203.0.113.9");
    expect(keys).toContain("build-week:email:serina@gmail.com");
  });

  it("treats an already-entered email as success and leaks nothing", async () => {
    adminMock.mockReturnValue(fakeDb({ error: { code: "23505" } }).client);
    const res = await POST(request(valid({ updates: true })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(tagMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the table has not been created yet", async () => {
    adminMock.mockReturnValue(fakeDb({ error: { code: "42P01" } }).client);
    expect((await POST(request(valid()))).status).toBe(503);
  });

  it("returns 500 on an unexpected database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    adminMock.mockReturnValue(fakeDb({ error: { code: "XX000" } }).client);
    expect((await POST(request(valid()))).status).toBe(500);
  });

  it("returns 500 when the service-role client is not configured", async () => {
    adminMock.mockImplementation(() => { throw new Error("no key"); });
    expect((await POST(request(valid()))).status).toBe(500);
  });

  it("tags and enrolls only when the updates box is ticked", async () => {
    const db = fakeDb();
    adminMock.mockReturnValue(db.client);
    const res = await POST(request(valid({ updates: true })));
    expect(res.status).toBe(200);
    expect(tagMock).toHaveBeenCalledWith(db.client, ["serina@gmail.com"], BUILD_WEEK_TAG, BUILD_WEEK_SOURCE);
  });

  it("never tags an address that has unsubscribed, but still saves the entry", async () => {
    const db = fakeDb();
    adminMock.mockReturnValue(db.client);
    suppressedMock.mockResolvedValue(true);
    const res = await POST(request(valid({ updates: true })));
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(tagMock).not.toHaveBeenCalled();
  });

  it("still succeeds if tagging throws after the entry was saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    adminMock.mockReturnValue(fakeDb().client);
    tagMock.mockRejectedValue(new Error("marketing table missing"));
    expect((await POST(request(valid({ updates: true })))).status).toBe(200);
  });
});
