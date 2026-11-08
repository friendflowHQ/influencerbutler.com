/**
 * Summary: plan-level resolves Beginner / Power / legacy from LS variant, comp,
 *   desktop intent, then inference (in that rank), and syncPlanLevelTag keeps a
 *   single managed plan- tag plus plan_level columns without letting a weaker
 *   source overwrite a stronger one. The LS hook supersedes the app trial.
 * Dependencies: vitest, @/lib/plan-level, ./funnels-v2-fake-db.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  canReplacePlanSource,
  normalizePlanLevelIntent,
  planSourceRank,
  resolvePlanLevel,
  syncPlanLevelForPlanChange,
  syncPlanLevelFromLsSubscription,
  syncPlanLevelTag,
} from "@/lib/plan-level";
import { makeFakeDb } from "./funnels-v2-fake-db";

const ENV_KEYS = [
  "LEMONSQUEEZY_VARIANT_BEGINNER_SOLO_MONTHLY",
  "LEMONSQUEEZY_VARIANT_POWER_SOLO_MONTHLY",
  "LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON = "999";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("source rank", () => {
  it("orders ls > comp > intent > inferred > unknown", () => {
    expect(planSourceRank("ls")).toBeLessThan(planSourceRank("comp"));
    expect(planSourceRank("comp")).toBeLessThan(planSourceRank("intent"));
    expect(planSourceRank("intent")).toBeLessThan(planSourceRank("inferred"));
    expect(planSourceRank("inferred")).toBeLessThan(planSourceRank(null));
  });
  it("same or higher rank may replace; lower may not", () => {
    expect(canReplacePlanSource("ls", "ls")).toBe(true);
    expect(canReplacePlanSource("intent", "ls")).toBe(true);
    expect(canReplacePlanSource("ls", "intent")).toBe(false);
    expect(canReplacePlanSource(null, "inferred")).toBe(true);
  });
});

describe("normalizePlanLevelIntent", () => {
  it("accepts level words and display names", () => {
    expect(normalizePlanLevelIntent("Beginner")).toBe("beginner");
    expect(normalizePlanLevelIntent("Power User")).toBe("power");
    expect(normalizePlanLevelIntent("power_user")).toBe("power");
    expect(normalizePlanLevelIntent("pro")).toBe("power");
    expect(normalizePlanLevelIntent("legacy")).toBe("legacy");
    expect(normalizePlanLevelIntent("enterprise")).toBeNull();
    expect(normalizePlanLevelIntent(3)).toBeNull();
  });
});

describe("resolvePlanLevel", () => {
  it("prefers the LS variant; unknown variants read as legacy", () => {
    expect(resolvePlanLevel({ lsVariantId: "123", intent: "beginner" })).toEqual({ level: "legacy", source: "ls" });
  });
  it("ignores the add-on variant", () => {
    expect(resolvePlanLevel({ lsVariantId: "999", intent: "beginner" })).toEqual({ level: "beginner", source: "intent" });
  });
  it("uses a comp plan string next", () => {
    expect(resolvePlanLevel({ compPlan: "power-solo-monthly", intent: "beginner" })).toEqual({ level: "power", source: "comp" });
    expect(resolvePlanLevel({ compPlan: "solo-monthly" })).toEqual({ level: "legacy", source: "comp" });
  });
  it("then intent, then inference from walkthrough answers", () => {
    expect(resolvePlanLevel({ intent: "power" })).toEqual({ level: "power", source: "intent" });
    expect(resolvePlanLevel({ profile: { v: 1, stage: "capture", experience: "brand-new" } })).toEqual({
      level: "beginner",
      source: "inferred",
    });
    expect(resolvePlanLevel({ tags: ["wt-goal-beginner-start"] })).toEqual({ level: "beginner", source: "inferred" });
  });
  it("returns null when nothing says", () => {
    expect(resolvePlanLevel({})).toBeNull();
    expect(resolvePlanLevel({ profile: { v: 1, stage: "capture", experience: "existing" } })).toBeNull();
  });
});

describe("syncPlanLevelTag", () => {
  it("replaces the plan- tag and writes the columns", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: ["vip", "plan-beginner"], plan_level: "beginner", plan_level_source: "intent" }] },
    });
    const r = await syncPlanLevelTag(fake.db, "A@b.co", "power", "ls");
    expect(r).toEqual({ ok: true, changed: true });
    expect(fake.tables.email_subscribers[0]).toMatchObject({
      tags: ["vip", "plan-power"],
      plan_level: "power",
      plan_level_source: "ls",
    });
  });

  it("refuses a lower-ranked source", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: ["plan-power"], plan_level: "power", plan_level_source: "ls" }] },
    });
    const r = await syncPlanLevelTag(fake.db, "a@b.co", "beginner", "intent");
    expect(r.reason).toBe("lower-rank");
    expect(fake.tables.email_subscribers[0].tags).toEqual(["plan-power"]);
  });

  it("force overrides the rank guard", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: ["plan-power"], plan_level: "power", plan_level_source: "ls" }] },
    });
    const r = await syncPlanLevelTag(fake.db, "a@b.co", "beginner", "intent", { force: true });
    expect(r.changed).toBe(true);
    expect(fake.tables.email_subscribers[0].tags).toEqual(["plan-beginner"]);
  });

  it("reports unchanged without writing", async () => {
    const fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: ["plan-power"], plan_level: "power", plan_level_source: "ls" }] },
    });
    const r = await syncPlanLevelTag(fake.db, "a@b.co", "power", "ls");
    expect(r.reason).toBe("unchanged");
    expect(fake.calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("never creates a contact", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [] } });
    const r = await syncPlanLevelTag(fake.db, "a@b.co", "power", "ls");
    expect(r.reason).toBe("no-contact");
    expect(fake.tables.email_subscribers).toEqual([]);
  });

  it("with columns missing, writes the tag but a weak source cannot replace an existing tag", async () => {
    const missingColumns = { email_subscribers: ["plan_level", "plan_level_source"] };
    const a = makeFakeDb({ tables: { email_subscribers: [{ email: "a@b.co", tags: [] }] }, missingColumns });
    expect((await syncPlanLevelTag(a.db, "a@b.co", "beginner", "intent")).changed).toBe(true);
    expect(a.tables.email_subscribers[0].tags).toEqual(["plan-beginner"]);

    const b = makeFakeDb({ tables: { email_subscribers: [{ email: "a@b.co", tags: ["plan-power"] }] }, missingColumns });
    expect((await syncPlanLevelTag(b.db, "a@b.co", "beginner", "intent")).reason).toBe("lower-rank");
    expect((await syncPlanLevelTag(b.db, "a@b.co", "beginner", "ls")).changed).toBe(true);
    expect(b.tables.email_subscribers[0].tags).toEqual(["plan-beginner"]);
  });

  it("rejects invalid input", async () => {
    const fake = makeFakeDb();
    expect((await syncPlanLevelTag(fake.db, "", "power", "ls")).reason).toBe("invalid");
    expect((await syncPlanLevelTag(fake.db, "a@b.co", "gold" as never, "ls")).reason).toBe("invalid");
    expect((await syncPlanLevelTag(fake.db, "a@b.co", "power", "magic" as never)).reason).toBe("invalid");
  });
});

describe("LS hooks", () => {
  it("syncs the level and supersedes an app trial when an LS trial starts", async () => {
    process.env.LEMONSQUEEZY_VARIANT_POWER_SOLO_MONTHLY = "555";
    const fake = makeFakeDb({
      tables: {
        email_subscribers: [{ email: "a@b.co", tags: [], app_trial_started_at: "2026-11-01T00:00:00Z", app_trial_converted_at: null }],
        email_funnel_assignments: [],
        profiles: [{ id: "u1", email: "A@b.co" }],
      },
    });
    await syncPlanLevelFromLsSubscription(fake.db, { userId: "u1", variantId: "555", trialStarted: true });
    const row = fake.tables.email_subscribers[0];
    expect(row.tags).toEqual(["plan-power"]);
    expect(row).toMatchObject({ plan_level: "power", plan_level_source: "ls" });
    expect(fake.tables.email_funnel_assignments).toEqual([
      expect.objectContaining({ email: "a@b.co", funnel: "apptrial", exit_reason: "superseded" }),
    ]);
  });

  it("ignores the add-on variant entirely", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [{ email: "a@b.co", tags: [] }] } });
    await syncPlanLevelFromLsSubscription(fake.db, { email: "a@b.co", variantId: "999", trialStarted: true });
    expect(fake.calls).toEqual([]);
  });

  it("never throws, even when the db does", async () => {
    const db = { from: () => { throw new Error("boom"); } } as never;
    await expect(syncPlanLevelFromLsSubscription(db, { email: "a@b.co", variantId: "1" })).resolves.toBeUndefined();
    await expect(syncPlanLevelForPlanChange(db, { email: "a@b.co", plan: "power-solo-monthly" })).resolves.toBeUndefined();
  });

  it("plan change falls back to the plan string when the variant is unknown", async () => {
    const fake = makeFakeDb({ tables: { email_subscribers: [{ email: "a@b.co", tags: ["plan-power"], plan_level: "power", plan_level_source: "ls" }] } });
    await syncPlanLevelForPlanChange(fake.db, { email: "a@b.co", variantId: "424242", plan: "beginner-solo-monthly" });
    expect(fake.tables.email_subscribers[0]).toMatchObject({ tags: ["plan-beginner"], plan_level: "beginner" });
  });
});
