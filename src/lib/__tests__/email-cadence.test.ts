import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CADENCE_WINDOW_MS,
  LIFECYCLE_FUNNELS,
  OVERDUE_EXEMPT_MS,
  canSendLifecycle,
  isCadenceExemptStep,
} from "@/lib/email-cadence";

type Call = { table: string; cols: string; filters: [string, string, unknown][] };

function fakeDb(result: { data?: unknown; error?: unknown } | (() => never)) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, cols: "", filters: [] };
    const b: Record<string, unknown> = {
      select(c: string) {
        call.cols = c;
        return b;
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        calls.push(call);
        if (typeof result === "function") return Promise.reject(new Error("boom")).then(res, rej);
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(res, rej);
      },
    };
    for (const f of ["eq", "in", "gte", "order", "limit"]) {
      b[f] = (col: string, val: unknown) => {
        call.filters.push([f, col, val]);
        return b;
      };
    }
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const NOW = Date.parse("2026-11-10T12:00:00Z");

describe("isCadenceExemptStep", () => {
  it("exempts day0, apptrial day1 and urgency slots only", () => {
    expect(isCadenceExemptStep("trial", "day0", "base")).toBe(true);
    expect(isCadenceExemptStep("onboarding", "day0", "base")).toBe(true);
    expect(isCadenceExemptStep("apptrial", "day1", "base")).toBe(true);
    expect(isCadenceExemptStep("trial", "day1", "module")).toBe(false);
    expect(isCadenceExemptStep("trial", "day13", "urgency")).toBe(true);
    expect(isCadenceExemptStep("conversion", "5d", "urgency")).toBe(true);
    expect(isCadenceExemptStep("apptrial", "day3", "module")).toBe(false);
    expect(isCadenceExemptStep("upgrade", "u1", "base")).toBe(false);
  });
});

describe("canSendLifecycle", () => {
  it("exempt steps skip the lookup entirely", async () => {
    const { db, calls } = fakeDb({ data: [{ created_at: "2026-11-10T11:00:00Z" }] });
    expect(await canSendLifecycle(db, "a@b.com", NOW, { tierIsExempt: true })).toEqual({
      ok: true,
      reason: "exempt",
      lastSentAt: null,
    });
    expect(calls).toHaveLength(0);
  });

  it("more than 48h overdue sends anyway", async () => {
    const { db, calls } = fakeDb({ data: [{ created_at: "2026-11-10T11:00:00Z" }] });
    const r = await canSendLifecycle(db, "a@b.com", NOW, { overdueMs: OVERDUE_EXEMPT_MS + 1 });
    expect(r.reason).toBe("overdue");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(0);
    // Exactly 48h is not yet overdue.
    const r2 = await canSendLifecycle(db, "a@b.com", NOW, { overdueMs: OVERDUE_EXEMPT_MS });
    expect(r2.ok).toBe(false);
  });

  it("defers when a lifecycle send landed inside 44h", async () => {
    const { db, calls } = fakeDb({ data: [{ created_at: "2026-11-09T20:00:00Z" }] });
    const r = await canSendLifecycle(db, " A@B.com ", NOW, { overdueMs: 1000 });
    expect(r).toEqual({ ok: false, reason: "capped", lastSentAt: "2026-11-09T20:00:00Z" });
    const f = calls[0].filters;
    expect(calls[0].table).toBe("email_sends");
    expect(f).toContainEqual(["eq", "recipient", "a@b.com"]);
    expect(f).toContainEqual(["eq", "status", "sent"]);
    expect(f).toContainEqual(["in", "funnel", [...LIFECYCLE_FUNNELS]]);
    expect(f).toContainEqual(["gte", "created_at", new Date(NOW - CADENCE_WINDOW_MS).toISOString()]);
  });

  it("allows when nothing was sent in the window", async () => {
    const { db } = fakeDb({ data: [] });
    expect((await canSendLifecycle(db, "a@b.com", NOW)).reason).toBe("clear");
  });

  it("fails open on a read error or a throw", async () => {
    const err = fakeDb({ error: { code: "42P01" } });
    expect(await canSendLifecycle(err.db, "a@b.com", NOW)).toMatchObject({ ok: true, reason: "lookup-failed" });
    const thrown = fakeDb((() => {
      throw new Error("x");
    }) as () => never);
    expect(await canSendLifecycle(thrown.db, "a@b.com", NOW)).toMatchObject({ ok: true, reason: "lookup-failed" });
  });

  it("honors a custom window and funnel list", async () => {
    const { db, calls } = fakeDb({ data: [] });
    await canSendLifecycle(db, "a@b.com", NOW, { windowMs: 3_600_000, funnels: ["trial"] });
    expect(calls[0].filters).toContainEqual(["in", "funnel", ["trial"]]);
    expect(calls[0].filters).toContainEqual(["gte", "created_at", new Date(NOW - 3_600_000).toISOString()]);
  });
});
