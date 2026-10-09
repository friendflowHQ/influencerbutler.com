import { describe, it, expect, vi, beforeEach } from "vitest";

// isEmailAdmin reads ADMIN_EMAILS; stub the module so the test needs no env and
// does not pull in next/headers.
const isEmailAdmin = vi.fn<(email: string | null | undefined) => boolean>(() => false);
vi.mock("@/lib/admin", () => ({ isEmailAdmin: (e: string | null | undefined) => isEmailAdmin(e) }));

import {
  GRACE_DAYS,
  eraseUserData,
  escapeLike,
  executeDeletion,
  deletionBlocker,
  hasRetainedRecords,
  listDueDeletions,
  requestDeletion,
  retiredEmail,
  scheduledForFrom,
} from "@/lib/account-deletion";

type Call = { table: string; op: string; filters: Array<[string, string, unknown]>; payload?: unknown };
type Reply = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

const MISSING_TABLE = { code: "PGRST205", message: "no such table" };

function makeAdmin(respond: (c: Call) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const finish = (): Required<Reply> => {
      calls.push(call);
      const r = respond(call) ?? {};
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      delete: () => ((call.op = "delete"), b),
      update: (p: unknown) => ((call.op = "update"), (call.payload = p), b),
      upsert: (p: unknown) => ((call.op = "upsert"), (call.payload = p), b),
      eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), b),
      ilike: (c: string, v: unknown) => (call.filters.push(["ilike", c, v]), b),
      like: (c: string, v: unknown) => (call.filters.push(["like", c, v]), b),
      in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), b),
      is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), b),
      limit: () => b,
      maybeSingle: async () => finish(),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(finish()).then(res, rej),
    };
    return b;
  };
  const authAdmin = {
    getUserById: vi.fn(async () => ({ data: { user: { id: "u1", email: "Sam_B@Example.com" } }, error: null })),
    deleteUser: vi.fn(async () => ({ error: null as { message: string } | null })),
    updateUserById: vi.fn(async () => ({ error: null as { message: string } | null })),
  };
  const remove = vi.fn(async () => ({}));
  const admin = {
    from: builder,
    storage: { from: () => ({ remove }) },
    auth: { admin: authAdmin },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls, authAdmin, remove };
}

beforeEach(() => {
  isEmailAdmin.mockReset();
  isEmailAdmin.mockReturnValue(false);
});

describe("helpers", () => {
  it("escapes LIKE wildcards so underscores in an address do not match other users", () => {
    expect(escapeLike("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com");
  });

  it("builds a non-identifying retired email", () => {
    expect(retiredEmail("abc")).toBe("deleted-abc@deleted.invalid");
  });

  it("schedules deletion GRACE_DAYS out", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const due = new Date(scheduledForFrom(now));
    expect(due.getTime() - now.getTime()).toBe(GRACE_DAYS * 86400000);
  });
});

describe("eraseUserData", () => {
  it("deletes by id and by case-insensitive escaped email, and never touches suppressions", async () => {
    const { admin, calls, remove } = makeAdmin();
    const errors = await eraseUserData(admin, "u1", "Sam_B@Example.com");
    expect(errors).toEqual([]);

    const ai = calls.filter((c) => c.table === "ai_concierge_sessions");
    expect(ai.some((c) => c.op === "delete" && c.filters.some(([, col, v]) => col === "user_id" && v === "u1"))).toBe(true);
    expect(
      ai.some((c) => c.filters.some(([k, col, v]) => k === "ilike" && col === "user_email" && v === "Sam\\_B@Example.com")),
    ).toBe(true);

    expect(calls.some((c) => c.table === "email_suppressions")).toBe(false);
    expect(remove).toHaveBeenCalledWith(["u1/avatar.webp", "u1/avatar.gif"]);
  });

  it("keeps newsletter rows that record an unsubscribe", async () => {
    const { admin, calls } = makeAdmin();
    await eraseUserData(admin, "u1", "sam@example.com");
    const sub = calls.find((c) => c.table === "email_subscribers");
    expect(sub?.op).toBe("delete");
    expect(sub?.filters).toContainEqual(["is", "unsubscribed_at", null]);
  });

  it("anonymizes community posts instead of deleting them", async () => {
    const { admin, calls } = makeAdmin();
    await eraseUserData(admin, "u1", "sam@example.com");
    const cq = calls.filter((c) => c.table === "community_questions");
    expect(cq.every((c) => c.op === "update")).toBe(true);
    expect(cq[0].payload).toEqual({ author_id: null, author_email: null });
  });

  it("tolerates tables and columns that prod does not have yet", async () => {
    const { admin } = makeAdmin(() => ({ error: MISSING_TABLE }));
    expect(await eraseUserData(admin, "u1", "sam@example.com")).toEqual([]);
  });

  it("reports real errors so the caller does not delete the login", async () => {
    const { admin } = makeAdmin((c) =>
      c.table === "extension_orders" ? { error: { code: "XX000", message: "boom" } } : undefined,
    );
    const errors = await eraseUserData(admin, "u1", "sam@example.com");
    expect(errors).toEqual(["extension_orders: boom"]);
  });
});

describe("hasRetainedRecords", () => {
  it("is true when a payout or tax row exists", async () => {
    const { admin } = makeAdmin((c) => (c.table === "affiliate_tax_forms" ? { count: 1 } : { count: 0 }));
    expect(await hasRetainedRecords(admin, "u1")).toBe(true);
  });

  it("is false when every retained table is empty or missing", async () => {
    const { admin } = makeAdmin((c) => (c.table === "affiliate_payouts" ? { error: MISSING_TABLE } : { count: 0 }));
    expect(await hasRetainedRecords(admin, "u1")).toBe(false);
  });

  it("errs on the side of keeping records when a check fails for a real reason", async () => {
    const { admin } = makeAdmin(() => ({ error: { code: "XX000", message: "down" } }));
    expect(await hasRetainedRecords(admin, "u1")).toBe(true);
  });
});

describe("deletionBlocker", () => {
  it("blocks a live subscription", async () => {
    const { admin } = makeAdmin((c) => (c.table === "subscriptions" ? { data: [{ id: "s1" }] } : undefined));
    expect(await deletionBlocker(admin, "u1", "a@b.com")).toBe("subscription");
  });

  it("allows a user with no live subscription", async () => {
    const { admin } = makeAdmin((c) => (c.table === "subscriptions" ? { data: [] } : undefined));
    expect(await deletionBlocker(admin, "u1", "a@b.com")).toBeNull();
  });

  it("blocks active staff and allow-listed admin emails", async () => {
    const staff = makeAdmin((c) => (c.table === "staff_members" ? { data: { is_active: true } } : undefined));
    expect(await deletionBlocker(staff.admin, "u1", "a@b.com")).toBe("staff");

    isEmailAdmin.mockReturnValue(true);
    expect(await deletionBlocker(makeAdmin().admin, "u1", "boss@b.com")).toBe("staff");
  });

  it("fails closed when the subscription check errors", async () => {
    const { admin } = makeAdmin((c) =>
      c.table === "subscriptions" ? { error: { code: "XX000", message: "down" } } : undefined,
    );
    expect(await deletionBlocker(admin, "u1", "a@b.com")).toBe("check_failed");
  });
});

describe("requestDeletion", () => {
  it("records a pending request in app_config", async () => {
    const { admin, calls } = makeAdmin();
    const now = new Date("2026-10-07T00:00:00Z");
    const res = await requestDeletion(admin, "u1", "a@b.com", now);
    expect(res).toEqual({ ok: true, scheduledFor: scheduledForFrom(now), alreadyPending: false });
    const write = calls.find((c) => c.table === "app_config" && c.op === "upsert");
    expect((write?.payload as { key: string }).key).toBe("account_deletion:u1");
  });

  it("is idempotent and keeps the original date", async () => {
    const existing = { scheduledFor: "2026-10-12T00:00:00.000Z", requestedAt: "2026-10-05T00:00:00.000Z", attempts: 0 };
    const { admin, calls } = makeAdmin((c) =>
      c.table === "app_config" && c.op === "select" ? { data: { value: existing } } : undefined,
    );
    const res = await requestDeletion(admin, "u1", "a@b.com", new Date("2026-10-07T00:00:00Z"));
    expect(res).toEqual({ ok: true, scheduledFor: existing.scheduledFor, alreadyPending: true });
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("refuses while a subscription is live", async () => {
    const { admin } = makeAdmin((c) => (c.table === "subscriptions" ? { data: [{ id: "s1" }] } : undefined));
    expect(await requestDeletion(admin, "u1", "a@b.com")).toEqual({ ok: false, code: "subscription" });
  });
});

describe("executeDeletion", () => {
  const clean = (c: Call): Reply | undefined => {
    if (c.table === "subscriptions") return { data: [] };
    if (c.op === "select" && c.table.startsWith("affiliate_")) return { count: 0 };
    return undefined;
  };

  it("hard-deletes a user with nothing to retain", async () => {
    const { admin, authAdmin } = makeAdmin(clean);
    const res = await executeDeletion(admin, "u1");
    expect(res.outcome).toBe("deleted");
    expect(authAdmin.deleteUser).toHaveBeenCalledWith("u1");
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("retires (does not delete) an affiliate with tax or payout records", async () => {
    const { admin, authAdmin, calls } = makeAdmin((c) => {
      if (c.table === "affiliate_tax_forms" && c.op === "select") return { count: 1 };
      return clean(c);
    });
    const res = await executeDeletion(admin, "u1");
    expect(res.outcome).toBe("retired");
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ email: "deleted-u1@deleted.invalid", ban_duration: "876000h" }),
    );
    // Retained rows are never deleted.
    expect(calls.some((c) => c.table === "affiliate_tax_forms" && c.op === "delete")).toBe(false);
    expect(calls.some((c) => c.table === "affiliate_payouts" && c.op === "delete")).toBe(false);
  });

  it("falls back to retiring when the auth delete is rejected", async () => {
    const { admin, authAdmin } = makeAdmin(clean);
    authAdmin.deleteUser.mockResolvedValueOnce({ error: { message: "fk violation" } });
    const res = await executeDeletion(admin, "u1");
    expect(res.outcome).toBe("retired");
    expect(authAdmin.updateUserById).toHaveBeenCalled();
  });

  it("does not delete the login when an erase step failed, so it can retry", async () => {
    const { admin, authAdmin } = makeAdmin((c) =>
      c.table === "call_bookings" ? { error: { code: "XX000", message: "boom" } } : clean(c),
    );
    const res = await executeDeletion(admin, "u1");
    expect(res.outcome).toBe("failed");
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("is blocked if they re-subscribed during the grace window", async () => {
    const { admin, authAdmin, calls } = makeAdmin((c) => (c.table === "subscriptions" ? { data: [{ id: "s1" }] } : undefined));
    const res = await executeDeletion(admin, "u1");
    expect(res).toMatchObject({ outcome: "blocked", blocker: "subscription" });
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(calls.some((c) => c.op === "delete" && c.table === "extension_orders")).toBe(false);
  });

  it("lets an admin force past the subscription guard", async () => {
    const { admin, authAdmin } = makeAdmin((c) => {
      if (c.table === "subscriptions") return { data: [{ id: "s1" }] };
      return clean(c);
    });
    const res = await executeDeletion(admin, "u1", { force: true });
    expect(res.outcome).toBe("deleted");
    expect(authAdmin.deleteUser).toHaveBeenCalled();
  });

  it("reports not_found for a user that no longer exists", async () => {
    const { admin, authAdmin } = makeAdmin(clean);
    authAdmin.getUserById.mockResolvedValueOnce({ data: { user: null as never }, error: null });
    expect(await executeDeletion(admin, "gone")).toEqual({ outcome: "not_found" });
  });
});

describe("listDueDeletions", () => {
  it("returns only requests whose grace period has ended", async () => {
    const rows = [
      { key: "account_deletion:due", value: { scheduledFor: "2026-10-01T00:00:00.000Z", attempts: 1 } },
      { key: "account_deletion:later", value: { scheduledFor: "2026-10-20T00:00:00.000Z" } },
      { key: "account_deletion:bad", value: {} },
    ];
    const { admin } = makeAdmin((c) => (c.table === "app_config" ? { data: rows } : undefined));
    const due = await listDueDeletions(admin, new Date("2026-10-07T00:00:00Z"));
    expect(due.map((d) => d.userId)).toEqual(["due"]);
    expect(due[0].attempts).toBe(1);
  });
});
