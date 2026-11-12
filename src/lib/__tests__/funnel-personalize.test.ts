import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildEventLine,
  buildGoalLine,
  buildPriceLockLine,
  buildTrackVars,
  buildUpgradeToolsLine,
  clearNextEventCache,
  contentKeyForStep,
  exitAssignment,
  getAssignment,
  isInFlight,
  loadNextEvent,
  loadSubscriberSignals,
  lockAssignment,
  rankModules,
  selectBase,
} from "@/lib/funnel-personalize";
import { PRICE_CHANGE } from "@/lib/pricing-constants";

// ---------------------------------------------------------------------------
// Tiny chainable fake of the supabase-js query builder.
// ---------------------------------------------------------------------------

type Q = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  cols: string;
  filters: [string, string, unknown][];
  payload?: unknown;
  opts?: unknown;
  single: boolean;
};
type R = { data?: unknown; error?: unknown };

function fakeDb(handler: (q: Q) => R) {
  const calls: Q[] = [];
  const from = (table: string) => {
    const q: Q = { table, op: "select", cols: "", filters: [], single: false };
    const run = () => {
      calls.push(q);
      const r = handler(q);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    };
    const filter = (name: string) => (col: string, val: unknown) => {
      q.filters.push([name, col, val]);
      return b;
    };
    const b: Record<string, unknown> = {
      select(c: string) {
        q.cols = c;
        return b;
      },
      insert(p: unknown) {
        q.op = "insert";
        q.payload = p;
        return b;
      },
      update(p: unknown) {
        q.op = "update";
        q.payload = p;
        return b;
      },
      upsert(p: unknown, o: unknown) {
        q.op = "upsert";
        q.payload = p;
        q.opts = o;
        return b;
      },
      eq: filter("eq"),
      is: filter("is"),
      in: filter("in"),
      gte: filter("gte"),
      gt: filter("gt"),
      lte: filter("lte"),
      order: filter("order"),
      limit: filter("limit"),
      maybeSingle() {
        q.single = true;
        return run();
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return run().then(res, rej);
      },
    };
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const NOW_BEFORE = Date.parse("2026-11-10T12:00:00Z");
const NOW_AFTER = Date.parse(PRICE_CHANGE.effectiveAt) + 60_000;

// ---------------------------------------------------------------------------

describe("selectBase", () => {
  it("maps plan level, legacy reads as power, nothing reads as unknown", () => {
    expect(selectBase({ planLevel: "beginner" })).toBe("beginner");
    expect(selectBase({ planLevel: "power" })).toBe("power");
    expect(selectBase({ planLevel: "legacy" })).toBe("power");
    expect(selectBase({})).toBe("unknown");
  });

  it("falls back to the plan-* tag", () => {
    expect(selectBase({ tags: ["plan-beginner"] })).toBe("beginner");
    expect(selectBase({ tags: ["plan-power", "plan-beginner"] })).toBe("power");
  });

  it("brand-new walkthrough answers give starter, but never for a paid plan", () => {
    expect(selectBase({ tags: ["wt-exp-brand-new"] })).toBe("starter");
    expect(selectBase({ planLevel: "beginner", planLevelSource: "intent", tags: ["wt-goal-beginner-start"] })).toBe(
      "starter",
    );
    expect(selectBase({ planLevel: "beginner", planLevelSource: "ls", tags: ["wt-exp-brand-new"] })).toBe("beginner");
    expect(selectBase({ planLevel: "power", paid: true, tags: ["wt-exp-brand-new"] })).toBe("power");
  });
});

describe("rankModules", () => {
  it("puts the goal module first, then precedence order, max 3", () => {
    const tags = [
      "wt-plat-instagram",
      "wt-plat-walmart",
      "wt-plat-deals-influencer",
      "wt-goal-video-marketplaces",
      "wt-mode-offsite",
    ];
    expect(rankModules(tags)).toEqual(["video", "deals", "walmart"]);
  });

  it("uses precedence deals, cc-auto, walmart, video, social, amazon-offsite", () => {
    expect(rankModules(["wt-mode-both", "wt-plat-facebook"], 6)).toEqual(["social", "amazon-offsite"]);
    expect(rankModules(["wt-goal-cc-auto-accept", "wt-plat-walmart"])).toEqual(["cc-auto", "walmart"]);
  });

  it("returns nothing for no or unrelated tags", () => {
    expect(rankModules([])).toEqual([]);
    expect(rankModules(null)).toEqual([]);
    expect(rankModules(["wt-plat-benable", "wt-plat-youtube", "wt-exp-existing"])).toEqual([]);
  });
});

describe("contentKeyForStep", () => {
  it("base and urgency slots get tier.track", () => {
    expect(contentKeyForStep({ tier: "day0", slot: "base" }, { track: "beginner", modules: ["walmart"] })).toBe(
      "day0.beginner",
    );
    expect(contentKeyForStep({ tier: "day14", slot: "urgency" }, { track: "power", modules: [] })).toBe("day14.power");
  });

  it("module slots consume modules[moduleIndex] in order", () => {
    const a = { track: "power" as const, modules: ["walmart", "deals"] as ("walmart" | "deals")[] };
    expect(contentKeyForStep({ tier: "day3", slot: "module", moduleIndex: 0 }, a)).toBe("day3.mod-walmart.power");
    expect(contentKeyForStep({ tier: "day5", slot: "module", moduleIndex: 1 }, a)).toBe("day5.mod-deals.power");
    // No module C: base key.
    expect(contentKeyForStep({ tier: "day10", slot: "module", moduleIndex: 2 }, a)).toBe("day10.power");
  });
});

describe("buildTrackVars", () => {
  it("prices come from LEVEL_PRICE_CENTS", () => {
    // {{price}} is always the Power User price (copy reads "Power User is {{price}}").
    const b = buildTrackVars({ base: "beginner", now: NOW_BEFORE });
    expect(b.price).toBe("$39/month");
    expect(b.beginnerPrice).toBe("$24.99/month");
    const p = buildTrackVars({ base: "power", now: NOW_BEFORE });
    expect(p.price).toBe("$39/month");
    expect(p.beginnerPrice).toBe("$24.99/month");
    expect(buildTrackVars({ base: "unknown", now: NOW_BEFORE }).price).toBe("$39/month");
    expect(buildTrackVars({ base: "starter", now: NOW_BEFORE }).price).toBe("$39/month");
    expect(buildTrackVars({ base: "power", seatTier: "duo", now: NOW_BEFORE }).price).toBe("$69/month");
    expect(buildTrackVars({ base: "power", interval: "annual", now: NOW_BEFORE }).price).toBe("$390/year");
  });

  it("bookCallUrl is Power only", () => {
    expect(buildTrackVars({ base: "power", now: NOW_BEFORE }).bookCallUrl).toBe(
      "https://www.influencerbutler.com/dashboard/book",
    );
    for (const base of ["beginner", "unknown", "starter"] as const) {
      expect(buildTrackVars({ base, now: NOW_BEFORE }).bookCallUrl).toBe("");
    }
  });

  it("aiLine differs by plan and never promises Beginner unlimited AI", () => {
    expect(buildTrackVars({ base: "beginner" }).aiLine).toContain("150 AI actions");
    expect(buildTrackVars({ base: "power" }).aiLine).toContain("own OpenAI key");
  });

  it("priceLockLine names the new prices before the change and vanishes after", () => {
    const b = buildPriceLockLine("beginner", "solo", "monthly", NOW_BEFORE);
    expect(b).toContain("$24.99 to $29.99/month");
    expect(b).toContain("November 30 at 11:59pm Pacific");
    expect(b).not.toContain("Power User goes");
    const u = buildPriceLockLine("unknown", "solo", "monthly", NOW_BEFORE);
    expect(u).toContain("Beginner goes from $24.99 to $29.99/month");
    expect(u).toContain("Power User goes from $39 to $49/month");
    expect(buildPriceLockLine("beginner", "solo", "monthly", NOW_AFTER)).toBe("");
    expect(buildTrackVars({ base: "power", now: NOW_AFTER }).priceLockLine).toBe("");
  });

  it("priceLockLine covers every seat tier in the price lock", () => {
    expect(buildPriceLockLine("power", "team", "monthly", NOW_BEFORE)).toContain("$129 to $155/month");
    expect(buildPriceLockLine("beginner", "duo", "annual", NOW_BEFORE)).toContain("$449 to $539/year");
  });

  it("goalLine follows the walkthrough goal", () => {
    expect(buildGoalLine(["wt-goal-cc-auto-accept"])).toContain("Creator Connections");
    expect(buildGoalLine(["wt-plat-amazon"])).toBe("");
    expect(buildTrackVars({ base: "beginner", tags: ["wt-goal-video-marketplaces"] }).goalLine).toContain("video");
  });

  it("eventLine only for a future event", () => {
    const ev = { id: "e1", title: "Live Q&A", startsAt: "2026-11-12T18:00:00Z", timezone: "America/Denver" };
    const line = buildEventLine(ev, "https://www.influencerbutler.com", NOW_BEFORE);
    expect(line).toContain('"Live Q&A"');
    expect(line).toContain("https://www.influencerbutler.com/events/e1");
    expect(line).toContain("at 11:00 AM MST");
    expect(buildEventLine(ev, undefined, Date.parse("2026-11-12T18:30:00Z"))).toBe("");
    expect(buildEventLine(null)).toBe("");
    expect(buildTrackVars({ base: "power", nextEvent: ev, now: NOW_BEFORE }).eventLine).toBe(line);
  });

  it("never emits em or en dashes", () => {
    for (const base of ["beginner", "power", "unknown", "starter"] as const) {
      const v = buildTrackVars({
        base,
        tags: ["wt-goal-everything"],
        nextEvent: { id: "x", title: "Call", startsAt: "2026-11-12T18:00:00Z", timezone: "America/Denver" },
        now: NOW_BEFORE,
      });
      for (const s of Object.values(v)) expect(s).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe("buildUpgradeToolsLine", () => {
  it("leads with the person's modules and fills to three", () => {
    expect(buildUpgradeToolsLine([])).toBe("Walmart Butler, Social Posting Butler and YouTube Butler");
    expect(buildUpgradeToolsLine(["cc-auto", "walmart"])).toBe(
      "Messenger Butler for your Creator Connections inbox, Walmart Butler and Social Posting Butler",
    );
  });
});

describe("isInFlight", () => {
  const start = Date.parse("2026-11-09T00:00:00Z");
  it("is true only for entries more than 3 days before v2 started", () => {
    expect(isInFlight(start - 4 * 86_400_000, start)).toBe(true);
    expect(isInFlight(start - 2 * 86_400_000, start)).toBe(false);
    expect(isInFlight(start + 1000, start)).toBe(false);
    expect(isInFlight(null, start)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

describe("loadSubscriberSignals", () => {
  it("reads tags and plan_level", async () => {
    const { db } = fakeDb(() => ({ data: { tags: ["wt-plat-walmart"], plan_level: "power", plan_level_source: "ls" } }));
    const s = await loadSubscriberSignals(db, " A@B.com ");
    expect(s).toEqual({ tags: ["wt-plat-walmart"], planLevel: "power", planLevelSource: "ls" });
  });

  it("retries with tags only on a missing column and uses the plan tag", async () => {
    const { db, calls } = fakeDb((q) =>
      q.cols.includes("plan_level") ? { error: { code: "42703" } } : { data: { tags: ["plan-beginner"] } },
    );
    const s = await loadSubscriberSignals(db, "a@b.com");
    expect(calls.map((c) => c.cols)).toEqual(["tags,plan_level,plan_level_source", "tags"]);
    expect(s.planLevel).toBe("beginner");
    expect(calls[0].filters).toContainEqual(["eq", "email", "a@b.com"]);
  });

  it("returns empty signals on other errors", async () => {
    const { db } = fakeDb(() => ({ error: { code: "XX000" } }));
    expect(await loadSubscriberSignals(db, "a@b.com")).toEqual({ tags: [], planLevel: null, planLevelSource: null });
  });
});

describe("getAssignment", () => {
  const computed = { track: "beginner" as const, modules: ["walmart", "deals"] as ("walmart" | "deals")[] };

  it("falls back to an in-memory unknown assignment when the table is missing", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const { db } = fakeDb(() => ({ error: { code } }));
      const a = await getAssignment(db, { email: "A@b.com", funnel: "apptrial", computed });
      expect(a).toMatchObject({ email: "a@b.com", track: "unknown", modules: [], persisted: false, lockedAt: null });
    }
  });

  it("inserts a new unlocked assignment from the computed values", async () => {
    const { db, calls } = fakeDb((q) => (q.op === "select" ? { data: null } : {}));
    const a = await getAssignment(db, { email: "a@b.com", funnel: "apptrial", computed, now: NOW_BEFORE });
    expect(a).toMatchObject({ track: "beginner", modules: ["walmart", "deals"], lockedAt: null, persisted: true });
    const ins = calls.find((c) => c.op === "upsert");
    expect(ins?.payload).toMatchObject({ email: "a@b.com", funnel: "apptrial", track: "beginner", locked_at: null });
    expect(ins?.opts).toEqual({ onConflict: "email,funnel", ignoreDuplicates: true });
  });

  it("an in-flight person is stored as unknown and locked now", async () => {
    const { db, calls } = fakeDb((q) => (q.op === "select" ? { data: null } : {}));
    const a = await getAssignment(db, { email: "a@b.com", funnel: "trial", computed, inFlight: true, now: NOW_BEFORE });
    expect(a.track).toBe("unknown");
    expect(a.modules).toEqual(["walmart", "deals"]);
    expect(a.lockedAt).toBe(new Date(NOW_BEFORE).toISOString());
    expect(calls.find((c) => c.op === "upsert")?.payload).toMatchObject({ track: "unknown" });
  });

  it("a locked row is sticky: never rewritten", async () => {
    const { db, calls } = fakeDb(() => ({
      data: { track: "power", modules: ["social"], locked_at: "2026-11-01T00:00:00Z", exited_at: null, exit_reason: null },
    }));
    const a = await getAssignment(db, { email: "a@b.com", funnel: "apptrial", computed });
    expect(a).toMatchObject({ track: "power", modules: ["social"], lockedAt: "2026-11-01T00:00:00Z" });
    expect(calls.some((c) => c.op !== "select")).toBe(false);
  });

  it("an exited row is returned as exited", async () => {
    const { db } = fakeDb(() => ({
      data: { track: "beginner", modules: [], locked_at: null, exited_at: "2026-11-02T00:00:00Z", exit_reason: "superseded" },
    }));
    const a = await getAssignment(db, { email: "a@b.com", funnel: "apptrial", computed });
    expect(a.exitedAt).toBe("2026-11-02T00:00:00Z");
    expect(a.exitReason).toBe("superseded");
  });

  it("an unlocked row is refreshed to the latest computed values", async () => {
    const { db, calls } = fakeDb((q) =>
      q.op === "select"
        ? { data: { track: "unknown", modules: [], locked_at: null, exited_at: null, exit_reason: null } }
        : {},
    );
    const a = await getAssignment(db, { email: "a@b.com", funnel: "apptrial", computed });
    expect(a).toMatchObject({ track: "beginner", modules: ["walmart", "deals"] });
    const upd = calls.find((c) => c.op === "update");
    expect(upd?.payload).toMatchObject({ track: "beginner", modules: ["walmart", "deals"] });
    expect(upd?.filters).toContainEqual(["is", "locked_at", null]);
  });

  it("drops unknown module names from stored rows", async () => {
    const { db } = fakeDb(() => ({
      data: { track: "power", modules: ["walmart", "harvester", "photo"], locked_at: "x", exited_at: null },
    }));
    const a = await getAssignment(db, { email: "a@b.com", funnel: "apptrial", computed });
    expect(a.modules).toEqual(["walmart"]);
  });
});

describe("lockAssignment / exitAssignment", () => {
  it("lock only touches unlocked rows", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await lockAssignment(db, "A@b.com", "apptrial", NOW_BEFORE);
    expect(calls[0]).toMatchObject({ op: "update", table: "email_funnel_assignments" });
    expect(calls[0].filters).toContainEqual(["is", "locked_at", null]);
    expect(calls[0].filters).toContainEqual(["eq", "email", "a@b.com"]);
  });

  it("exit keeps the first exit and never throws on a missing table", async () => {
    const ok = fakeDb(() => ({}));
    await exitAssignment(ok.db, { email: "a@b.com", funnel: "apptrial", reason: "superseded", now: NOW_BEFORE });
    expect(ok.calls.map((c) => c.op)).toEqual(["upsert", "update"]);
    expect(ok.calls[1].filters).toContainEqual(["is", "exited_at", null]);

    const missing = fakeDb(() => ({ error: { code: "42P01" } }));
    await expect(
      exitAssignment(missing.db, { email: "a@b.com", funnel: "apptrial", reason: "superseded" }),
    ).resolves.toBeUndefined();
    expect(missing.calls).toHaveLength(1);
  });
});

describe("loadNextEvent", () => {
  beforeEach(() => clearNextEventCache());

  it("reads the next public scheduled event that has not started", async () => {
    const { db, calls } = fakeDb(() => ({
      data: [{ id: "e1", title: "Group call", starts_at: "2026-11-12T18:00:00Z", timezone: "America/Denver" }],
    }));
    const ev = await loadNextEvent(db, NOW_BEFORE);
    expect(ev).toEqual({ id: "e1", title: "Group call", startsAt: "2026-11-12T18:00:00Z", timezone: "America/Denver" });
    expect(calls[0].filters).toContainEqual(["eq", "is_private", false]);
    expect(calls[0].filters).toContainEqual(["gt", "starts_at", new Date(NOW_BEFORE).toISOString()]);
  });

  it("returns null on error", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42P01" } }));
    expect(await loadNextEvent(db, NOW_BEFORE)).toBeNull();
  });
});
