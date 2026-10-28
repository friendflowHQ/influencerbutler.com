/**
 * Summary: Unit tests for /api/licenses/keys-for-email - the worker-only lookup
 *   of the keys this site links to an account email (secret-gated, revoked and
 *   key-less rows left out, exact email match).
 * Dependencies: vitest, ../route, @/lib/admin-service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-service", () => ({ adminService: vi.fn() }));

import { POST } from "../route";
import { adminService } from "@/lib/admin-service";

const adminServiceMock = adminService as unknown as ReturnType<typeof vi.fn>;
const SECRET = "worker-secret-test";

function makeSvc(opts: { userId: string | null; rows: Array<{ key: string | null; status: string }>; seen?: string[] }) {
  const from = (table: string) => {
    if (table === "profiles") {
      const q = {
        select: () => q,
        ilike: (_col: string, v: string) => { opts.seen?.push(v); return q; },
        maybeSingle: async () => ({ data: opts.userId ? { id: opts.userId } : null, error: null }),
      };
      return q;
    }
    const q = {
      select: () => q,
      eq: () => q,
      order: async () => ({ data: opts.rows, error: null }),
    };
    return q;
  };
  return { from };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/licenses/keys-for-email", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/licenses/keys-for-email", () => {
  beforeEach(() => {
    process.env.LICENSING_WORKER_SECRET = SECRET;
    adminServiceMock.mockReset();
  });

  it("refuses without the worker secret", async () => {
    const res = await POST(request({ email: "liz@example.com" }, { "x-ib-worker-secret": "nope" }));
    expect(res.status).toBe(401);
    expect(adminServiceMock).not.toHaveBeenCalled();
  });

  it("returns the account's usable keys, newest first, without revoked or key-less rows", async () => {
    const seen: string[] = [];
    adminServiceMock.mockReturnValue(makeSvc({
      userId: "u1",
      seen,
      rows: [
        { key: "PLAN-KEY", status: "active" },
        { key: "GONE", status: "revoked" },
        { key: null, status: "active" },
        { key: "ADDON", status: "Active" },
      ],
    }));
    const res = await POST(request({ email: " Liz_D@Example.com " }, { "x-ib-worker-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: [{ key: "PLAN-KEY", status: "active" }, { key: "ADDON", status: "active" }] });
    expect(seen).toEqual(["liz\\_d@example.com"]);
  });

  it("answers an unknown email with no keys and rejects a malformed one", async () => {
    adminServiceMock.mockReturnValue(makeSvc({ userId: null, rows: [] }));
    expect(await (await POST(request({ email: "x@y.com" }, { "x-ib-worker-secret": SECRET }))).json()).toEqual({ keys: [] });
    expect((await POST(request({ email: "nope" }, { "x-ib-worker-secret": SECRET }))).status).toBe(400);
  });
});
