/**
 * Summary: markActivated records each (email, signal) once in
 *   funnel_milestones; strong signals set activated_at (first wins) and weak
 *   ones only engaged_at; nothing creates a contact; missing tables/columns are
 *   silent no-ops; it never throws; repeat calls are memoized. Also covers the
 *   funnel-assignments exit helpers (supersede the app trial on an LS trial).
 * Dependencies: vitest, @/lib/funnel-activation, @/lib/funnel-assignments,
 *   @/lib/supabase/admin (mocked), ./funnels-v2-fake-db.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  __resetActivationMemo,
  isDesktopMilestone,
  markActivated,
  markActivatedForUser,
} from "@/lib/funnel-activation";
import { exitAssignment, supersedeAppTrial } from "@/lib/funnel-assignments";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeFakeDb } from "./funnels-v2-fake-db";

const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const AT = new Date("2026-11-10T12:00:00Z");

beforeEach(() => {
  __resetActivationMemo();
  adminMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function subscriber(extra: Record<string, unknown> = {}) {
  return { email: "a@b.co", tags: [], activated_at: null, activation_signal: null, engaged_at: null, ...extra };
}

describe("markActivated", () => {
  it("a strong signal sets activated_at, activation_signal and engaged_at, and logs a milestone", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()], funnel_milestones: [] } });
    const r = await markActivated(" A@B.co ", "desktop-action", { db: fake.db, source: "desktop-actions", at: AT });
    expect(r).toEqual({ ok: true, recorded: true, activated: true, engaged: true });
    expect(fake.tables.email_subscribers[0]).toMatchObject({
      activated_at: AT.toISOString(),
      activation_signal: "desktop-action",
      engaged_at: AT.toISOString(),
    });
    expect(fake.tables.funnel_milestones).toEqual([
      { email: "a@b.co", milestone: "desktop-action", source: "desktop-actions", occurred_at: AT.toISOString() },
    ]);
  });

  it("first strong signal wins", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [subscriber({ activated_at: "2026-11-01T00:00:00.000Z", activation_signal: "first-butler-run", engaged_at: "2026-11-01T00:00:00.000Z" })] },
    });
    const r = await markActivated("a@b.co", "earnings-sync", { db: fake.db, at: AT });
    expect(r).toMatchObject({ ok: true, recorded: true, activated: false, engaged: false });
    expect(fake.tables.email_subscribers[0].activation_signal).toBe("first-butler-run");
  });

  it("a weak signal only sets engaged_at", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()] } });
    const r = await markActivated("a@b.co", "extension-install", { db: fake.db, at: AT });
    expect(r).toMatchObject({ activated: false, engaged: true });
    expect(fake.tables.email_subscribers[0].activated_at).toBeNull();
    expect(fake.tables.email_subscribers[0].engaged_at).toBe(AT.toISOString());
  });

  it("a duplicate milestone is not re-recorded", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [subscriber()], funnel_milestones: [{ email: "a@b.co", milestone: "license-validate", occurred_at: "x" }] },
    });
    const r = await markActivated("a@b.co", "license-validate", { db: fake.db, at: AT });
    expect(r.recorded).toBe(false);
    expect(fake.tables.funnel_milestones).toHaveLength(1);
    expect(fake.tables.funnel_milestones[0].occurred_at).toBe("x");
  });

  it("never creates a contact row", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [] } });
    const r = await markActivated("new@b.co", "first-butler-run", { db: fake.db, at: AT });
    expect(r).toMatchObject({ ok: true, recorded: true, activated: false, engaged: false });
    expect(fake.tables.email_subscribers).toEqual([]);
  });

  it("missing migration is a silent no-op", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [subscriber()] },
      missingTables: ["funnel_milestones"],
      missingColumns: { email_subscribers: ["activated_at", "activation_signal", "engaged_at"] },
    });
    const r = await markActivated("a@b.co", "first-butler-run", { db: fake.db, at: AT });
    expect(r).toEqual({ ok: true, recorded: false, activated: false, engaged: false });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rejects bad input without touching the db", async () => {
    adminMock.mockImplementation(() => {
      throw new Error("should not be called");
    });
    expect((await markActivated("", "desktop-action")).reason).toBe("invalid");
    expect((await markActivated("not-an-email", "desktop-action")).reason).toBe("invalid");
    expect((await markActivated("a@b.co", "made-up" as never)).reason).toBe("invalid");
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("never throws, even when the client cannot be built", async () => {
    adminMock.mockImplementation(() => {
      throw new Error("missing env");
    });
    await expect(markActivated("a@b.co", "desktop-action")).resolves.toMatchObject({ ok: false, reason: "error" });
  });

  it("memoizes a clean pass so hot paths write once per instance", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()] } });
    await markActivated("a@b.co", "license-validate", { db: fake.db, at: AT });
    const n = fake.calls.length;
    const again = await markActivated("a@b.co", "license-validate", { db: fake.db, at: AT });
    expect(again.reason).toBe("memo");
    expect(fake.calls.length).toBe(n);
  });

  it("defaults to the service-role client", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()] } });
    adminMock.mockReturnValue(fake.db);
    await markActivated("a@b.co", "earnings-sync", { at: AT });
    expect(fake.tables.email_subscribers[0].activation_signal).toBe("earnings-sync");
  });
});

describe("markActivatedForUser", () => {
  it("looks up the email by user id when none is given", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()], profiles: [{ id: "u1", email: "A@b.co" }] } });
    const r = await markActivatedForUser({ userId: "u1" }, "desktop-action", { db: fake.db, at: AT });
    expect(r.activated).toBe(true);
  });

  it("memoizes by user id so the profile lookup is not repeated", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [subscriber()], profiles: [{ id: "u1", email: "a@b.co" }] } });
    await markActivatedForUser({ userId: "u1" }, "desktop-action", { db: fake.db, at: AT });
    const n = fake.calls.length;
    expect((await markActivatedForUser({ userId: "u1" }, "desktop-action", { db: fake.db })).reason).toBe("memo");
    expect(fake.calls.length).toBe(n);
  });
});

describe("isDesktopMilestone", () => {
  it("only whitelists the desktop beacons", () => {
    expect(isDesktopMilestone("first-butler-run")).toBe(true);
    expect(isDesktopMilestone("extension-paired")).toBe(true);
    expect(isDesktopMilestone("license-validate")).toBe(false);
    expect(isDesktopMilestone("anything")).toBe(false);
  });
});

describe("funnel-assignments exits", () => {
  it("exitAssignment updates an open assignment once", async () => {
    const fake = makeFakeDb({
      tables: { email_funnel_assignments: [{ email: "a@b.co", funnel: "apptrial", track: "power", exited_at: null, exit_reason: null }] },
    });
    expect(await exitAssignment(fake.db, "a@b.co", "apptrial", "superseded", { at: AT })).toEqual({ ok: true, changed: true });
    expect(fake.tables.email_funnel_assignments[0]).toMatchObject({ track: "power", exited_at: AT.toISOString(), exit_reason: "superseded" });
    const again = await exitAssignment(fake.db, "a@b.co", "apptrial", "manual");
    expect(again.reason).toBe("already-exited");
    expect(fake.tables.email_funnel_assignments[0].exit_reason).toBe("superseded");
  });

  it("supersedeAppTrial creates an exited row for an app-trial lead with no assignment yet", async () => {
    const fake = makeFakeDb({
      tables: {
        email_funnel_assignments: [],
        email_subscribers: [{ email: "a@b.co", app_trial_started_at: "2026-11-01T00:00:00Z", app_trial_converted_at: null }],
      },
    });
    expect((await supersedeAppTrial(fake.db, "A@b.co")).changed).toBe(true);
    expect(fake.tables.email_funnel_assignments).toEqual([
      expect.objectContaining({ email: "a@b.co", funnel: "apptrial", exit_reason: "superseded" }),
    ]);
  });

  it("supersedeAppTrial leaves people who were never on the app trial alone", async () => {
    const fake = makeFakeDb({
      tables: { email_funnel_assignments: [], email_subscribers: [{ email: "a@b.co", app_trial_started_at: null }] },
    });
    expect((await supersedeAppTrial(fake.db, "a@b.co")).reason).toBe("no-assignment");
    expect(fake.tables.email_funnel_assignments).toEqual([]);
  });

  it("supersedeAppTrial never writes a fake conversion stamp", async () => {
    const fake = makeFakeDb({
      tables: {
        email_funnel_assignments: [],
        email_subscribers: [{ email: "a@b.co", app_trial_started_at: "2026-11-01T00:00:00Z", app_trial_converted_at: null }],
      },
    });
    await supersedeAppTrial(fake.db, "a@b.co");
    expect(fake.tables.email_subscribers[0].app_trial_converted_at).toBeNull();
  });

  it("a missing assignments table degrades to a no-op", async () => {
    const fake = makeFakeDb({ missingTables: ["email_funnel_assignments"] });
    expect(await supersedeAppTrial(fake.db, "a@b.co")).toEqual({ ok: true, changed: false, reason: "migration-pending" });
  });
});
