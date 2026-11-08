import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    throw new Error("no db in tests");
  }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  armCopyProblem,
  assignArm,
  computeFunnelArmStats,
  computeSequenceArmStats,
  denverDayParts,
  findVariantGroups,
  matchExperiment,
  priceLockStopNeeded,
  promoteWinner,
  renderArmCopy,
  resolveFunnelCopyWithExperiment,
  type Experiment,
} from "@/lib/email-experiments";
import { clearTrackCopy, registerTrackCopy } from "@/lib/funnel-track-registry";
import type { FunnelOverride } from "@/lib/funnel-copy";

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DAY = 24 * 60 * 60 * 1000;

function exp(patch: Partial<Experiment> = {}): Experiment {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    kind: "funnel_step",
    name: "test",
    funnel: "apptrial",
    tier: "day3",
    contentKey: "day3",
    segment: null,
    baseTag: null,
    primaryMetric: "click",
    guardrailMetric: "paid",
    status: "running",
    minSendsPerArm: 200,
    maxDays: 45,
    conversionWindowDays: 14,
    looksDone: 0,
    lastLookAt: null,
    startedAt: "2026-11-12T00:00:00Z",
    endedAt: null,
    decidedAt: null,
    winnerArm: null,
    decision: null,
    createdBy: "",
    createdAt: null,
    updatedBy: "",
    updatedAt: null,
    arms: [
      { arm: "a", subject: null, body: null, sequenceId: null },
      { arm: "b", subject: "Challenger {{firstName}}", body: "Hi {{firstName}}, new body.", sequenceId: null },
    ],
    ...patch,
  };
}

function ov(funnel: string, tier: string, patch: Partial<FunnelOverride> = {}): FunnelOverride {
  return {
    funnel,
    tier,
    subject: null,
    body: null,
    applyTag: null,
    dayOffset: null,
    enabled: true,
    updatedAt: null,
    updatedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    ...patch,
  };
}

type Call = { table: string; row: Record<string, unknown>; opts: unknown };
function fakeDb(calls: Call[]): SupabaseClient {
  return {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, opts: unknown) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("assignArm", () => {
  it("is deterministic and ignores case and whitespace", () => {
    const id = "abc-123";
    const a = assignArm("Person@Example.com", id);
    for (let i = 0; i < 5; i++) expect(assignArm("Person@Example.com", id)).toBe(a);
    expect(assignArm("  person@example.com ", id)).toBe(a);
  });

  it("splits 10k emails 50/50 within 2%", () => {
    let b = 0;
    for (let i = 0; i < 10000; i++) if (assignArm(`user${i}@test.com`, "exp-1") === "b") b++;
    expect(Math.abs(b / 10000 - 0.5)).toBeLessThan(0.02);
  });

  it("splits independently per experiment", () => {
    let same = 0;
    for (let i = 0; i < 10000; i++) {
      if (assignArm(`user${i}@test.com`, "exp-1") === assignArm(`user${i}@test.com`, "exp-2")) same++;
    }
    expect(Math.abs(same / 10000 - 0.5)).toBeLessThan(0.03);
  });
});

describe("promoteWinner", () => {
  beforeEach(() => clearTrackCopy());

  it("refuses with conflict when segment is null and track code copy exists", async () => {
    registerTrackCopy("apptrial", {
      "day3.beginner": { subject: "Beginner day 3", build: () => "Beginner body" },
    });
    const calls: Call[] = [];
    const res = await promoteWinner(fakeDb(calls), exp(), "b", { overrides: new Map() });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("conflict");
      expect(res.tailoredKeys).toContain("day3.beginner");
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses with conflict when a tailored override is active", async () => {
    const overrides = new Map([["apptrial:day3.mod-walmart", ov("apptrial", "day3.mod-walmart", { subject: "x" })]]);
    const calls: Call[] = [];
    const res = await promoteWinner(fakeDb(calls), exp(), "b", { overrides });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("ignores a blank (reset) tailored override", async () => {
    const overrides = new Map([["apptrial:day3.power", ov("apptrial", "day3.power", { subject: "", body: "" })]]);
    const calls: Call[] = [];
    const res = await promoteWinner(fakeDb(calls), exp(), "b", { overrides });
    expect(res).toEqual({ ok: true, wroteKey: "day3" });
  });

  it("writes the bare tier when no tailored copy exists", async () => {
    const calls: Call[] = [];
    const res = await promoteWinner(fakeDb(calls), exp(), "b", { overrides: new Map(), now: new Date("2026-12-01T00:00:00Z") });
    expect(res).toEqual({ ok: true, wroteKey: "day3" });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("email_funnel_overrides");
    expect(calls[0].row).toMatchObject({
      funnel: "apptrial",
      tier: "day3",
      subject: "Challenger {{firstName}}",
      body: "Hi {{firstName}}, new body.",
      enabled: true,
      updated_by: "ab:auto 11111111",
      updated_at: "2026-12-01T00:00:00.000Z",
    });
    expect(calls[0].opts).toEqual({ onConflict: "funnel,tier" });
  });

  it("writes to the segment's content key even when track copy exists", async () => {
    registerTrackCopy("apptrial", {
      "day3.beginner": { subject: "Beginner day 3", build: () => "Beginner body" },
    });
    const calls: Call[] = [];
    const res = await promoteWinner(
      fakeDb(calls),
      exp({ segment: "beginner", contentKey: "day3.beginner" }),
      "b",
      { overrides: new Map() },
    );
    expect(res).toEqual({ ok: true, wroteKey: "day3.beginner" });
    expect(calls[0].row.tier).toBe("day3.beginner");
  });

  it("writes nothing when the control wins", async () => {
    const calls: Call[] = [];
    expect(await promoteWinner(fakeDb(calls), exp(), "a", { overrides: new Map() })).toEqual({ ok: true, wroteKey: null });
    expect(calls).toHaveLength(0);
  });

  it("only writes the fields arm b sets", async () => {
    const calls: Call[] = [];
    const e = exp({
      arms: [
        { arm: "a", subject: null, body: null, sequenceId: null },
        { arm: "b", subject: "Only subject", body: null, sequenceId: null },
      ],
    });
    await promoteWinner(fakeDb(calls), e, "b", { overrides: new Map() });
    expect(calls[0].row.subject).toBe("Only subject");
    expect("body" in calls[0].row).toBe(false);
  });
});

describe("matchExperiment and copy overlay", () => {
  const broad = exp({ id: "broad" });
  const seg = exp({ id: "seg", segment: "beginner", contentKey: "day3.beginner" });

  it("prefers the exact segment, else the tier-wide test", () => {
    expect(matchExperiment([broad, seg], "apptrial", "day3.beginner")?.id).toBe("seg");
    expect(matchExperiment([broad, seg], "apptrial", "day3.power")?.id).toBe("broad");
    expect(matchExperiment([seg], "apptrial", "day3.power")).toBeNull();
    expect(matchExperiment([broad], "trial", "day3")).toBeNull();
    expect(matchExperiment([exp({ status: "draft" })], "apptrial", "day3")).toBeNull();
  });

  it("renders arm b over the control, field by field", () => {
    const control = { subject: "Control", body: "Control body" };
    expect(renderArmCopy(exp().arms[0], control, { firstName: "Alex" })).toEqual(control);
    expect(renderArmCopy(exp().arms[1], control, { firstName: "Alex" })).toEqual({
      subject: "Challenger Alex",
      body: "Hi Alex, new body.",
    });
    expect(
      renderArmCopy({ arm: "b", subject: "  ", body: "B", sequenceId: null }, control, {}),
    ).toEqual({ subject: "Control", body: "B" });
  });

  it("resolveFunnelCopyWithExperiment tags the send with id + variant", () => {
    const e = exp({ id: "x1" });
    const r = resolveFunnelCopyWithExperiment({
      funnel: "apptrial",
      contentKey: "day3",
      vars: { firstName: "Alex" },
      overrides: new Map(),
      email: "someone@test.com",
      experiments: [e],
      codeDefaultForKey: () => ({ subject: "Code", body: "Code body" }),
    });
    expect(r.experimentId).toBe("x1");
    expect(r.variant).toBe(assignArm("someone@test.com", "x1"));
    expect(r.subject).toBe(r.variant === "b" ? "Challenger Alex" : "Code");
    const none = resolveFunnelCopyWithExperiment({
      funnel: "apptrial",
      contentKey: "day3",
      vars: {},
      overrides: new Map(),
      email: "someone@test.com",
      experiments: [],
      codeDefaultForKey: () => ({ subject: "Code", body: "Code body" }),
    });
    expect(none.experimentId).toBeUndefined();
    expect(none.subject).toBe("Code");
  });
});

describe("armCopyProblem", () => {
  it("accepts ordinary copy and numeric en dash ranges", () => {
    expect(armCopyProblem("Hi {{firstName}}, your butlers are ready: run one today.")).toBeNull();
    expect(armCopyProblem(`Plans for 2024${EN}2026 creators`)).toBeNull();
    expect(armCopyProblem("May you sell a lot")).toBeNull();
  });
  it("rejects dashes, dates, Nov 29 and the price lock", () => {
    expect(armCopyProblem(`Hello ${EM} there`)).toMatch(/em dash/);
    expect(armCopyProblem(`Hello ${EN} there`)).toMatch(/en dash/);
    expect(armCopyProblem("Prices rise Nov 29")).toMatch(/Nov 29/);
    expect(armCopyProblem("Prices rise November 29th")).toMatch(/Nov 29/);
    expect(armCopyProblem("Join us Dec 3 at noon")).toMatch(/literal date/);
    expect(armCopyProblem("Deadline 2026-12-01")).toMatch(/literal date/);
    expect(armCopyProblem("Due 12/01/2026")).toMatch(/literal date/);
    expect(armCopyProblem("Locked: {{ priceLockLine }}")).toMatch(/priceLockLine/);
  });
});

describe("computeFunnelArmStats", () => {
  const now = Date.parse("2026-12-20T00:00:00Z");
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("dedupes, matures clicks after 48h and conversions after the window", () => {
    const stats = computeFunnelArmStats(
      [
        { recipient: "a1@x.com", variant: "a", createdAt: iso(20), clickedAt: iso(19) },
        { recipient: "A1@x.com", variant: "a", createdAt: iso(19), clickedAt: null }, // dup
        { recipient: "a2@x.com", variant: "a", createdAt: iso(1), clickedAt: iso(1) }, // click immature
        { recipient: "b1@x.com", variant: "b", createdAt: iso(16), clickedAt: null },
        { recipient: "b2@x.com", variant: "b", createdAt: iso(5), clickedAt: iso(4) }, // paid immature
        { recipient: "z@x.com", variant: null, createdAt: iso(5), clickedAt: null }, // no arm
      ],
      {
        now,
        windowDays: 14,
        paidAt: new Map([
          ["a1@x.com", [now - 30 * DAY]], // before the send: not counted
          ["b1@x.com", [now - 10 * DAY]], // inside the window
        ]),
        activatedAt: null,
      },
    );
    const [a, b] = stats;
    expect(a.sent).toBe(2);
    expect(a.metrics.click).toEqual({ n: 1, x: 1 });
    expect(a.metrics.paid).toEqual({ n: 1, x: 0 });
    expect(a.metrics.activation).toBeNull();
    expect(b.sent).toBe(2);
    expect(b.metrics.click).toEqual({ n: 2, x: 1 });
    expect(b.metrics.paid).toEqual({ n: 1, x: 1 });
  });

  it("sequence arm stats count distinct clickers and matured enrollments", () => {
    const st = computeSequenceArmStats(
      "b",
      [
        { recipient: "p@x.com", createdAt: iso(10), clickedAt: null },
        { recipient: "p@x.com", createdAt: iso(8), clickedAt: iso(8) },
        { recipient: "q@x.com", createdAt: iso(1), clickedAt: null },
      ],
      [
        { enrolledAt: iso(30), lastStepSent: 2, paid: true },
        { enrolledAt: iso(30), lastStepSent: 0, paid: false },
        { enrolledAt: iso(3), lastStepSent: 1, paid: false },
      ],
      { now, windowDays: 14 },
    );
    expect(st.sent).toBe(3);
    expect(st.metrics.click).toEqual({ n: 1, x: 1 });
    expect(st.metrics.paid).toEqual({ n: 1, x: 1 });
  });
});

describe("priceLockStopNeeded", () => {
  const after = Date.parse("2026-12-01T00:00:00Z");
  const before = Date.parse("2026-11-20T00:00:00Z");
  const lockControl = { subject: "Hi", body: "Body {{priceLockLine}}" };

  it("stops after the price change when only the control uses the lock line", () => {
    expect(priceLockStopNeeded(exp(), after, lockControl)).toBe(true);
    expect(priceLockStopNeeded(exp(), before, lockControl)).toBe(false);
  });
  it("keeps running when both or neither arm use it, or the test started after", () => {
    const both = exp({
      arms: [
        { arm: "a", subject: null, body: null, sequenceId: null },
        { arm: "b", subject: "New subject", body: null, sequenceId: null }, // body falls back to control
      ],
    });
    expect(priceLockStopNeeded(both, after, lockControl)).toBe(false);
    expect(priceLockStopNeeded(exp(), after, { subject: "Hi", body: "No lock" })).toBe(false);
    expect(priceLockStopNeeded(exp({ startedAt: "2026-11-30T00:00:00Z" }), after, lockControl)).toBe(false);
  });
  it("always stops when an explicit arm uses the token", () => {
    const e = exp({
      arms: [
        { arm: "a", subject: null, body: null, sequenceId: null },
        { arm: "b", subject: "x", body: "{{priceLockLine}}", sequenceId: null },
      ],
    });
    expect(priceLockStopNeeded(e, after, lockControl)).toBe(true);
  });
});

describe("findVariantGroups and denverDayParts", () => {
  it("groups active -a/-b siblings by base tag", () => {
    const rows = [
      { id: "1", name: "B", status: "active", trigger: { kind: "tag_added", tag: "cold-ig-b" }, created_at: "" },
      { id: "2", name: "A", status: "active", trigger: { kind: "tag_added", tag: "cold-ig-a" }, created_at: "" },
      { id: "3", name: "C", status: "paused", trigger: { kind: "tag_added", tag: "cold-ig-c" }, created_at: "" },
      { id: "4", name: "X", status: "active", trigger: { kind: "tag_added", tag: "plain-tag" }, created_at: "" },
      { id: "5", name: "S", status: "active", trigger: { kind: "source", source: "x" }, created_at: "" },
    ];
    const g = findVariantGroups(rows);
    expect([...g.keys()]).toEqual(["cold-ig"]);
    expect(g.get("cold-ig")!.map((s) => s.id)).toEqual(["2", "1"]);
  });
  it("reads the Denver calendar day and hour", () => {
    expect(denverDayParts(new Date("2026-11-08T06:30:00Z"))).toEqual({ day: "2026-11-07", hour: 23 });
    expect(denverDayParts(new Date("2026-11-08T16:00:00Z"))).toEqual({ day: "2026-11-08", hour: 9 });
  });
});

describe("firstPaidOrders (renewals are not conversions)", () => {
  it("keeps the first paid order per subscription and drops renewals, $0 orders and comps", async () => {
    const { firstPaidOrders } = await import("@/lib/email-experiments");
    const rows = [
      { user_id: "u1", created_at: "2026-10-01T00:00:00Z", total: 3900, ls_subscription_id: "s1" },
      { user_id: "u1", created_at: "2026-11-01T00:00:00Z", total: 3900, ls_subscription_id: "s1" }, // renewal
      { user_id: "u2", created_at: "2026-11-02T00:00:00Z", total: 0, ls_subscription_id: "s2" },
      { user_id: "u3", created_at: "2026-11-03T00:00:00Z", total: 3900, ls_subscription_id: "comp:abc" },
      { user_id: "u4", created_at: "2026-11-04T00:00:00Z", total: "2499", ls_subscription_id: null },
    ];
    expect(firstPaidOrders(rows).map((r) => `${r.user_id}@${r.created_at.slice(0, 10)}`)).toEqual([
      "u1@2026-10-01",
      "u4@2026-11-04",
    ]);
  });
});
