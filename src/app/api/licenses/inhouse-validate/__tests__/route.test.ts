/**
 * Summary: Unit tests for /api/licenses/inhouse-validate - the worker fallback
 *   that judges an in-house / trial key against the local tables. Focuses on the
 *   DEAD_KEY_STATUSES policy: only "revoked" is a hard kill; LS trial-mirror
 *   statuses (disabled/inactive) defer to the live-subscription check.
 * Dependencies: vitest, ../route, @/lib/admin-service, next/server (after).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-service", () => ({
  adminService: vi.fn(),
}));

// after() schedules post-response work; make it a no-op in tests so stampSeen
// never runs against the mock.
vi.mock("next/server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, after: vi.fn() };
});

import { POST } from "../route";
import { adminService } from "@/lib/admin-service";

const adminServiceMock = adminService as unknown as ReturnType<typeof vi.fn>;
const SECRET = "worker-secret-test";
const KEY = "26CC8AFF-8311-4AFF-B795-7FCC219DE00F";

type LicenseRow = { id: string; user_id: string; status: string; activation_limit: number | null } | null;
type Sub = { status: string; ls_variant_id: string | null; created_at: string };

function makeSvc(opts: { licenseRow: LicenseRow; subs: Sub[]; profileEmail?: string | null }) {
  const from = (table: string) => {
    if (table === "subscriptions") {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: async () => ({ data: opts.subs, error: null }),
      };
      return q;
    }
    if (table === "profiles") {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: opts.profileEmail ? { email: opts.profileEmail } : null,
          error: null,
        }),
      };
      return q;
    }
    if (table === "comp_grants") {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return q;
    }
    // license_keys
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: opts.licenseRow, error: null }),
    };
    return q;
  };
  return { from, auth: { admin: {} } };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/licenses/inhouse-validate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LICENSING_WORKER_SECRET = SECRET;
  delete process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON;
});

describe("/api/licenses/inhouse-validate", () => {
  it("rejects a wrong worker secret with 401", async () => {
    const res = await POST(request({ keyValue: KEY }, { "x-ib-worker-secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("validates a trial key whose LS-mirror status is 'disabled' but has an on_trial sub", async () => {
    adminServiceMock.mockReturnValue(
      makeSvc({
        licenseRow: { id: "lk1", user_id: "u1", status: "disabled", activation_limit: 1 },
        subs: [{ status: "on_trial", ls_variant_id: "1533746", created_at: "2026-08-11" }],
        profileEmail: "michelle@broadmindedsolutions.com",
      }),
    );
    const res = await POST(request({ keyValue: KEY }, { "x-ib-worker-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { valid: boolean; status: string; variantId: number | null };
    expect(json.valid).toBe(true);
    expect(json.status).toBe("on_trial");
    expect(json.variantId).toBe(1533746);
  });

  it("hard-rejects a 'revoked' key even with a live subscription", async () => {
    adminServiceMock.mockReturnValue(
      makeSvc({
        licenseRow: { id: "lk2", user_id: "u2", status: "revoked", activation_limit: 1 },
        subs: [{ status: "active", ls_variant_id: "1533746", created_at: "2026-08-11" }],
        profileEmail: "someone@example.com",
      }),
    );
    const res = await POST(request({ keyValue: KEY }, { "x-ib-worker-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { valid: boolean };
    expect(json.valid).toBe(false);
  });

  it("rejects a 'disabled' key when there is no live subscription (churned)", async () => {
    adminServiceMock.mockReturnValue(
      makeSvc({
        licenseRow: { id: "lk3", user_id: "u3", status: "disabled", activation_limit: 1 },
        subs: [],
        profileEmail: "churned@example.com",
      }),
    );
    const res = await POST(request({ keyValue: KEY }, { "x-ib-worker-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { valid: boolean };
    expect(json.valid).toBe(false);
  });
});
