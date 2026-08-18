/**
 * Summary: Unit tests for the LS self-heal fallback in resolveLicenseBearer
 *   (exercised via resolveLicenseOnly). Covers: backfill on a double DB miss
 *   with a UUID key, the UUID format gate, the per-instance negative cache, and
 *   the no-matching-profile case.
 * Dependencies: vitest, ../license-auth, @/lib/supabase/admin, @/lib/lemonsqueezy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/lemonsqueezy", () => ({
  validateLicenseWithLs: vi.fn(),
}));

import { resolveLicenseOnly } from "../license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateLicenseWithLs } from "@/lib/lemonsqueezy";

const createAdminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const validateMock = validateLicenseWithLs as unknown as ReturnType<typeof vi.fn>;

// Distinct UUIDs per test: the negative cache is module-scoped and persists
// across tests in this file, so reusing a key would leak cache state.
const UUID_A = "26CC8AFF-8311-4AFF-B795-7FCC219DE00F";
const UUID_B = "11111111-2222-3333-4444-555555555555";
const UUID_C = "99999999-8888-7777-6666-555544443333";
const NON_UUID = "not-a-uuid-but-long-enough-to-pass-length";

function makeAdmin(opts: {
  hashRow?: { user_id?: string | null; key_hash?: string | null } | null;
  keyRow?: { user_id?: string | null; key_hash?: string | null } | null;
  profileRow?: { id?: string | null } | null;
  upsertError?: { message?: string } | null;
  userEmail?: string | null;
}) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.upsertError ?? null });
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.profileRow ?? null, error: null }) }),
        }),
      };
    }
    // license_keys
    return {
      select: () => ({
        eq: (col: string) => ({
          maybeSingle: async () => ({
            data: col === "key_hash" ? opts.hashRow ?? null : opts.keyRow ?? null,
            error: null,
          }),
        }),
      }),
      upsert,
    };
  });
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { id, email: opts.userEmail ?? "michelle@broadmindedsolutions.com" } },
    error: null,
  }));
  return { client: { from, auth: { admin: { getUserById } } }, upsert, from, getUserById };
}

function bearer(key: string) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveLicenseBearer LS self-heal", () => {
  it("self-heals: double DB miss + UUID + LS hit + profile match resolves and upserts", async () => {
    const admin = makeAdmin({
      hashRow: null,
      keyRow: null,
      profileRow: { id: "user-1" },
    });
    createAdminMock.mockReturnValue(admin.client);
    validateMock.mockResolvedValue({
      lsLicenseKeyId: "500",
      key: UUID_A,
      status: "inactive",
      activationLimit: 1,
      activationsCount: 0,
      customerEmail: "Michelle@BroadmindedSolutions.com",
    });

    const res = await resolveLicenseOnly(bearer(UUID_A));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.auth.userId).toBe("user-1");
    }
    expect(validateMock).toHaveBeenCalledTimes(1);
    expect(admin.upsert).toHaveBeenCalledTimes(1);
  });

  it("never calls LS for a non-UUID key", async () => {
    const admin = makeAdmin({ hashRow: null, keyRow: null });
    createAdminMock.mockReturnValue(admin.client);

    const res = await resolveLicenseOnly(bearer(NON_UUID));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
    expect(validateMock).not.toHaveBeenCalled();
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it("returns 401 on an LS miss, and the negative cache skips LS on the retry", async () => {
    const admin = makeAdmin({ hashRow: null, keyRow: null });
    createAdminMock.mockReturnValue(admin.client);
    validateMock.mockResolvedValue(null);

    const first = await resolveLicenseOnly(bearer(UUID_B));
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.status).toBe(401);

    const second = await resolveLicenseOnly(bearer(UUID_B));
    expect(second.ok).toBe(false);

    // LS was only consulted once across the two calls (cache hit on the second).
    expect(validateMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without upserting when LS knows the key but no local profile matches", async () => {
    const admin = makeAdmin({ hashRow: null, keyRow: null, profileRow: null });
    createAdminMock.mockReturnValue(admin.client);
    validateMock.mockResolvedValue({
      lsLicenseKeyId: "501",
      key: UUID_C,
      status: "inactive",
      activationLimit: 1,
      activationsCount: 0,
      customerEmail: "guest@example.com",
    });

    const res = await resolveLicenseOnly(bearer(UUID_C));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
    expect(admin.upsert).not.toHaveBeenCalled();
  });
});
