/**
 * Summary: Unit tests for /api/admin/catalogue-harvest/heartbeat - HMAC
 *   signature verification, body validation, and successful upsert into the
 *   catalogue_harvest_status table via the mocked service-role client.
 * Dependencies: vitest, ../route, @/lib/admin, crypto.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/lib/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from "../route";
import { createAdminClient } from "@/lib/admin";

const createAdminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;

const TOKEN = "test-heartbeat-secret";

function signedRequest(body: unknown) {
  const text = JSON.stringify(body);
  const sig = createHmac("sha256", TOKEN).update(text).digest("hex");
  return new Request("http://localhost/api/admin/catalogue-harvest/heartbeat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-heartbeat-signature": sig,
    },
    body: text,
  });
}

function unsignedRequest(body: unknown, sig?: string) {
  return new Request("http://localhost/api/admin/catalogue-harvest/heartbeat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sig ? { "x-heartbeat-signature": sig } : {}),
    },
    body: JSON.stringify(body),
  });
}

function fakeAdminClient() {
  const upsertMock = vi.fn().mockResolvedValue({ error: null });
  const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
  return { client: { from: fromMock }, upsertMock, fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HARVEST_HEARTBEAT_TOKEN = TOKEN;
});

describe("/api/admin/catalogue-harvest/heartbeat", () => {
  it("rejects requests with no signature header", async () => {
    const res = await POST(unsignedRequest({ kind: "cc", status: "ok" }));
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid signature", async () => {
    const res = await POST(
      unsignedRequest({ kind: "cc", status: "ok" }, "0".repeat(64)),
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 if HARVEST_HEARTBEAT_TOKEN env is missing", async () => {
    delete process.env.HARVEST_HEARTBEAT_TOKEN;
    const res = await POST(signedRequest({ kind: "cc", status: "ok" }));
    expect(res.status).toBe(500);
  });

  it("rejects invalid kind", async () => {
    createAdminMock.mockReturnValue(fakeAdminClient().client);
    const res = await POST(signedRequest({ kind: "bogus", status: "ok" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid status", async () => {
    createAdminMock.mockReturnValue(fakeAdminClient().client);
    const res = await POST(signedRequest({ kind: "cc", status: "weird" }));
    expect(res.status).toBe(400);
  });

  it("upserts on a valid 'ok' heartbeat with full payload", async () => {
    const fake = fakeAdminClient();
    createAdminMock.mockReturnValue(fake.client);
    const payload = {
      kind: "cc",
      status: "ok",
      version: "20260528T1200Z",
      snapshotAt: "2026-05-28T12:00:34.000Z",
      campaignCount: 600500,
      durationMs: 314_000,
      reportedAt: "2026-05-28T12:05:00.000Z",
    };
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(fake.fromMock).toHaveBeenCalledWith("catalogue_harvest_status");
    expect(fake.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cc",
        status: "ok",
        version: "20260528T1200Z",
        snapshot_at: "2026-05-28T12:00:34.000Z",
        campaign_count: 600500,
        duration_ms: 314_000,
        reported_at: "2026-05-28T12:05:00.000Z",
      }),
      { onConflict: "kind" },
    );
  });

  it("upserts an 'error' heartbeat with the message preserved", async () => {
    const fake = fakeAdminClient();
    createAdminMock.mockReturnValue(fake.client);
    const res = await POST(
      signedRequest({
        kind: "spcc",
        status: "error",
        message: "session cookies expired",
        reportedAt: "2026-05-28T13:00:00.000Z",
      }),
    );
    expect(res.status).toBe(200);
    expect(fake.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "spcc",
        status: "error",
        message: "session cookies expired",
      }),
      { onConflict: "kind" },
    );
  });

  it("returns 500 when the Supabase upsert errors", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    createAdminMock.mockReturnValue({ from: fromMock });
    const res = await POST(signedRequest({ kind: "cc", status: "ok" }));
    expect(res.status).toBe(500);
  });
});
