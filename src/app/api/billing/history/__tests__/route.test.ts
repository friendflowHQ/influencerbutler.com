/**
 * Summary: /api/billing/history must authenticate via the Supabase session and
 *   never trust body-supplied identity.
 * Dependencies: vitest, ../route, @/lib/supabase/server, @/lib/supabase/admin,
 *   @/lib/lemonsqueezy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/lemonsqueezy", () => ({ lsApi: vi.fn() }));

import { POST } from "../route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lsApi } from "@/lib/lemonsqueezy";

const sessionMock = createClient as unknown as ReturnType<typeof vi.fn>;
const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const lsMock = lsApi as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/billing/history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedIn(user: { id: string; email: string } | null) {
  sessionMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: "no" } }) },
  });
}

function ownedSubs(ids: string[]) {
  const eq = vi.fn().mockResolvedValue({ data: ids.map((id) => ({ ls_subscription_id: id })), error: null });
  adminMock.mockReturnValue({ from: () => ({ select: () => ({ eq }) }) });
}

function invoiceResponse(subId: string) {
  return {
    ok: true,
    json: async () => ({ data: [{ id: `inv-${subId}`, attributes: { subscription_id: Number(subId) } }] }),
    text: async () => "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lsMock.mockImplementation(async (path: string) => {
    const m = /filter\[subscription_id\]=(\d+)/.exec(decodeURIComponent(path));
    return m ? invoiceResponse(m[1]) : { ok: true, json: async () => ({ data: [] }), text: async () => "" };
  });
});

describe("/api/billing/history", () => {
  it("returns 401 with no session and never calls Lemon Squeezy", async () => {
    signedIn(null);
    const res = await POST(req({ userEmail: "victim@example.com", lsSubscriptionId: "999" }));
    expect(res.status).toBe(401);
    expect(lsMock).not.toHaveBeenCalled();
  });

  it("ignores a body-supplied subscription id the caller does not own", async () => {
    signedIn({ id: "u1", email: "me@example.com" });
    ownedSubs(["111"]);
    const res = await POST(req({ lsSubscriptionIds: ["999"], userEmail: "victim@example.com" }));
    const json = (await res.json()) as { invoices: unknown[] };
    // 999 filtered out; falls back to the SESSION email lookup, which returns nothing.
    expect(json.invoices).toEqual([]);
    const paths = lsMock.mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(paths.some((p) => p.includes("999"))).toBe(false);
    expect(paths.some((p) => p.includes("victim@example.com"))).toBe(false);
    expect(paths.some((p) => p.includes("me@example.com"))).toBe(true);
  });

  it("returns invoices for the caller's own subscriptions", async () => {
    signedIn({ id: "u1", email: "me@example.com" });
    ownedSubs(["111"]);
    const res = await POST(req({ lsSubscriptionIds: ["111", "999"] }));
    const json = (await res.json()) as { invoices: { id: string }[] };
    expect(json.invoices.map((i) => i.id)).toEqual(["inv-111"]);
  });
});
