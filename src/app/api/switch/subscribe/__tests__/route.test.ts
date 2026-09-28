/**
 * Summary: Unit tests for /api/switch/subscribe - validation, honeypot,
 *   suppression, contact insert / tag union against a fake service-role
 *   client, and tag_added enrollment.
 * Dependencies: vitest, ../route, @/lib/supabase/admin, @/lib/email-unsubscribe,
 *   @/lib/email-marketing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/email-unsubscribe", () => ({
  isEmailSuppressed: vi.fn(),
}));
vi.mock("@/lib/email-marketing", () => ({
  enrollForTagAdded: vi.fn(),
}));

import { POST } from "../route";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailSuppressed } from "@/lib/email-unsubscribe";
import { enrollForTagAdded } from "@/lib/email-marketing";

const createAdminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const suppressedMock = isEmailSuppressed as unknown as ReturnType<typeof vi.fn>;
const enrollMock = enrollForTagAdded as unknown as ReturnType<typeof vi.fn>;

function request(body: unknown) {
  return new Request("http://localhost/api/switch/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Fake email_subscribers table: one optional existing row. */
function fakeDb(existing: { email: string; tags: string[] } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const from = vi.fn().mockReturnValue({ select, insert, update });
  return { client: { from }, from, insert, update, updateEq };
}

beforeEach(() => {
  vi.clearAllMocks();
  suppressedMock.mockResolvedValue(false);
  enrollMock.mockResolvedValue(undefined);
});

describe("/api/switch/subscribe", () => {
  it("rejects malformed JSON with 400", async () => {
    const res = await POST(request("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await POST(request({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it("drops honeypot submissions silently with 200", async () => {
    const res = await POST(request({ email: "bot@gmail.com", website: "http://spam" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it("accepts but never persists an undeliverable test address", async () => {
    const res = await POST(request({ email: "someone@example.com" }));
    expect(res.status).toBe(200);
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it("does not re-tag or enroll a suppressed address", async () => {
    suppressedMock.mockResolvedValue(true);
    const res = await POST(request({ email: "OptedOut@Gmail.com" }));
    expect(res.status).toBe(200);
    expect(suppressedMock).toHaveBeenCalledWith("optedout@gmail.com");
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it("inserts a new contact with source + tag and enrolls it", async () => {
    const db = fakeDb(null);
    createAdminMock.mockReturnValue(db.client);
    const res = await POST(request({ email: "  New@Creator.co " }));
    expect(res.status).toBe(200);
    expect(db.from).toHaveBeenCalledWith("email_subscribers");
    expect(db.insert).toHaveBeenCalledWith({
      email: "new@creator.co",
      source: "fluencer-fruit-switch",
      tags: ["fluencer-fruit-switch"],
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(enrollMock).toHaveBeenCalledWith(db.client, "fluencer-fruit-switch", ["new@creator.co"]);
  });

  it("unions the tag onto an existing contact without dropping their tags", async () => {
    const db = fakeDb({ email: "old@creator.co", tags: ["newsletter"] });
    createAdminMock.mockReturnValue(db.client);
    const res = await POST(request({ email: "old@creator.co" }));
    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith({ tags: ["newsletter", "fluencer-fruit-switch"] });
    expect(db.updateEq).toHaveBeenCalledWith("email", "old@creator.co");
    expect(enrollMock).toHaveBeenCalledWith(db.client, "fluencer-fruit-switch", ["old@creator.co"]);
  });

  it("skips the tag write when the contact already carries it but still fires enrollment", async () => {
    const db = fakeDb({ email: "again@creator.co", tags: ["fluencer-fruit-switch"] });
    createAdminMock.mockReturnValue(db.client);
    const res = await POST(request({ email: "again@creator.co" }));
    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    // enrollEmails dedups an active enrollment, so re-firing is safe.
    expect(enrollMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to a friendly success when the service role is not configured", async () => {
    createAdminMock.mockImplementation(() => {
      throw new Error("Missing Supabase service-role configuration");
    });
    const res = await POST(request({ email: "someone@creator.co" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(enrollMock).not.toHaveBeenCalled();
  });
});
