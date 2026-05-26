/**
 * Summary: Unit tests for /api/profiles/by-license - bearer auth,
 *   batch lookup against a fake service-role client, null fallback for
 *   missing hashes.
 * Dependencies: vitest, ../route, @/lib/admin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from "../route";
import { createAdminClient } from "@/lib/admin";

const createAdminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const SECRET = "shh-test-secret";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/profiles/by-license", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function fakeAdminClient(rows: Array<Record<string, unknown>>) {
  const inMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  const selectMock = vi.fn().mockReturnValue({ in: inMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  return { client: { from: fromMock }, inMock, selectMock, fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FEEDBACK_LOOKUP_SECRET = SECRET;
});

describe("/api/profiles/by-license", () => {
  it("rejects missing bearer with 401", async () => {
    const res = await POST(request({ hashes: [HASH_A] }));
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer with 401", async () => {
    const res = await POST(
      request({ hashes: [HASH_A] }, { authorization: "Bearer wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when secret env is missing", async () => {
    delete process.env.FEEDBACK_LOOKUP_SECRET;
    const res = await POST(
      request({ hashes: [HASH_A] }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 400 for non-array body", async () => {
    const res = await POST(
      request({ hashes: "nope" }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(400);
  });

  it("returns empty object for empty hashes", async () => {
    const res = await POST(
      request({ hashes: [] }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, profiles: {} });
  });

  it("ignores malformed hashes and queries only valid ones", async () => {
    const fake = fakeAdminClient([
      {
        key_hash: HASH_A,
        user_id: "user-a",
        profiles: { display_name: "Alice", username: "alice", avatar_url: null },
      },
    ]);
    createAdminMock.mockReturnValue(fake.client);

    const res = await POST(
      request(
        { hashes: [HASH_A, "not-a-hash", 42, null, HASH_A] },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profiles: Record<string, unknown> };
    expect(Object.keys(json.profiles)).toEqual([HASH_A]);
    expect(json.profiles[HASH_A]).toEqual({
      display_name: "Alice",
      username: "alice",
      avatar_url: null,
    });
    expect(fake.inMock).toHaveBeenCalledWith("key_hash", [HASH_A]);
  });

  it("returns null for hashes with no matching license_keys row", async () => {
    const fake = fakeAdminClient([
      {
        key_hash: HASH_A,
        user_id: "user-a",
        profiles: { display_name: "Alice", username: null, avatar_url: null },
      },
    ]);
    createAdminMock.mockReturnValue(fake.client);

    const res = await POST(
      request(
        { hashes: [HASH_A, HASH_B] },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profiles: Record<string, unknown> };
    expect(json.profiles[HASH_A]).toEqual({
      display_name: "Alice",
      username: null,
      avatar_url: null,
    });
    expect(json.profiles[HASH_B]).toBeNull();
  });

  it("returns null when the profile row has no display fields filled in", async () => {
    const fake = fakeAdminClient([
      {
        key_hash: HASH_C,
        user_id: "user-c",
        profiles: { display_name: null, username: null, avatar_url: null },
      },
    ]);
    createAdminMock.mockReturnValue(fake.client);

    const res = await POST(
      request({ hashes: [HASH_C] }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profiles: Record<string, unknown> };
    expect(json.profiles[HASH_C]).toBeNull();
  });

  it("returns 503 when the admin client is unavailable", async () => {
    createAdminMock.mockReturnValue(null);
    const res = await POST(
      request({ hashes: [HASH_A] }, { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(503);
  });

  it("flattens an array-shaped profiles relation", async () => {
    const fake = fakeAdminClient([
      {
        key_hash: HASH_A,
        user_id: "user-a",
        profiles: [{ display_name: "Alice", username: "alice", avatar_url: null }],
      },
    ]);
    createAdminMock.mockReturnValue(fake.client);

    const res = await POST(
      request({ hashes: [HASH_A] }, { authorization: `Bearer ${SECRET}` }),
    );
    const json = (await res.json()) as { profiles: Record<string, unknown> };
    expect(json.profiles[HASH_A]).toEqual({
      display_name: "Alice",
      username: "alice",
      avatar_url: null,
    });
  });
});
