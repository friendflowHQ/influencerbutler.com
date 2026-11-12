/**
 * Summary: The Growth page "Goals this month" baselines. Covers the
 * history-based active-subscriber count (activeSubscribersAt), the snapshot's
 * active_subscriptions.previous (start of month, paged past 1000 rows, comps
 * left out even when the comp list fails), goal cards reading the live
 * baseline instead of the saved seed-time one, and the Foyer route using
 * Denver month edges.
 * Dependencies: vitest, ../growth-metrics, ../growth-goals, the foyer route.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/affiliate-commissions-data", () => ({
  computeMonthlyEarnings: vi.fn(async () => null),
}));
vi.mock("@/lib/comps-data", () => ({
  loadCompSubscriptionIds: vi.fn(async () => new Set<string>()),
}));
vi.mock("@/lib/admin", () => ({
  requirePermission: vi.fn(async () => ({ id: "admin" })),
}));
vi.mock("@/lib/links-admin", () => ({
  callLinksAdmin: vi.fn(),
}));

import {
  activeSubscribersAt,
  computeGrowthSnapshot,
  type GrowthSnapshot,
  type SnapshotClient,
} from "../growth-metrics";
import {
  ensureSuggestions,
  liveBaseline,
  loadGoalsWithAchievements,
  type GoalsClient,
} from "../growth-goals";
import { callLinksAdmin } from "@/lib/links-admin";
import { GET as foyerGET } from "@/app/api/admin/growth/foyer/route";

const NOV_1_DENVER = Date.parse("2026-11-01T06:00:00.000Z"); // 00:00 MDT

// ---------------------------------------------------------------------------
// activeSubscribersAt
// ---------------------------------------------------------------------------

describe("activeSubscribersAt", () => {
  const paid = (id: string, at: string, total = 2900) => ({
    ls_subscription_id: id,
    created_at: at,
    total,
  });

  it("counts subs that paid before the instant and had not ended", () => {
    const subs = [
      { ls_subscription_id: "a", status: "active" },
      { ls_subscription_id: "b", status: "past_due" },
      { ls_subscription_id: "c", status: "paused" },
    ];
    const orders = [
      paid("a", "2026-09-10T12:00:00Z"),
      paid("b", "2026-10-02T12:00:00Z"),
      paid("c", "2026-10-31T12:00:00Z"),
    ];
    expect(activeSubscribersAt(subs, orders, NOV_1_DENVER)).toBe(3);
  });

  it("leaves out subs whose first real charge came after the instant", () => {
    const subs = [{ ls_subscription_id: "late", status: "active" }];
    expect(activeSubscribersAt(subs, [paid("late", "2026-11-03T12:00:00Z")], NOV_1_DENVER)).toBe(0);
    // A charge at 23:00 Denver on Oct 31 is 05:00 UTC Nov 1: still before the month began.
    expect(activeSubscribersAt(subs, [paid("late", "2026-11-01T05:00:00Z")], NOV_1_DENVER)).toBe(1);
  });

  it("never counts $0 orders, comp ids, live comps or the add-on", () => {
    const subs = [
      { ls_subscription_id: "trial", status: "active" },
      { ls_subscription_id: "comp:123", status: "active" },
      { ls_subscription_id: "lscomp", status: "active" },
      { ls_subscription_id: "addon", status: "active", ls_variant_id: "999" },
      { ls_subscription_id: "real", status: "active" },
    ];
    const orders = [
      paid("trial", "2026-10-01T12:00:00Z", 0),
      paid("comp:123", "2026-10-01T12:00:00Z"),
      paid("lscomp", "2026-10-01T12:00:00Z"),
      paid("addon", "2026-10-01T12:00:00Z"),
      paid("real", "2026-10-01T12:00:00Z"),
    ];
    expect(
      activeSubscribersAt(subs, orders, NOV_1_DENVER, {
        compSubscriptionIds: new Set(["lscomp"]),
        addonVariant: "999",
      }),
    ).toBe(1);
  });

  it("uses ends_at for cancelled and expired subs", () => {
    const subs = [
      { ls_subscription_id: "ended-before", status: "expired", ends_at: "2026-10-20T00:00:00Z" },
      { ls_subscription_id: "ends-after", status: "cancelled", ends_at: "2026-11-15T00:00:00Z" },
      { ls_subscription_id: "expired-after", status: "expired", ends_at: "2026-11-05T00:00:00Z" },
    ];
    const orders = [
      paid("ended-before", "2026-09-20T12:00:00Z"),
      paid("ends-after", "2026-10-15T12:00:00Z"),
      paid("expired-after", "2026-10-05T12:00:00Z"),
    ];
    expect(activeSubscribersAt(subs, orders, NOV_1_DENVER)).toBe(2);
  });

  it("estimates the end one period after the last charge when ends_at is missing", () => {
    const subs = [
      { ls_subscription_id: "recent", status: "expired", ends_at: null },
      { ls_subscription_id: "stale", status: "expired", ends_at: null },
    ];
    const orders = [
      paid("recent", "2026-10-20T12:00:00Z"), // + 31 days = Nov 20, still live on Nov 1
      paid("stale", "2026-08-01T12:00:00Z"), // + 31 days = Sept 1, gone by Nov 1
    ];
    expect(activeSubscribersAt(subs, orders, NOV_1_DENVER)).toBe(1);
  });

  it("counts a subscription once even with many renewals", () => {
    const subs = [{ ls_subscription_id: "a", status: "active" }];
    const orders = [
      paid("a", "2026-08-01T12:00:00Z"),
      paid("a", "2026-09-01T12:00:00Z"),
      paid("a", "2026-10-01T12:00:00Z"),
    ];
    expect(activeSubscribersAt(subs, orders, NOV_1_DENVER)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeGrowthSnapshot: active_subscriptions via a fake paged client
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** In-memory PostgREST look-alike that caps every response at 1000 rows. */
function fakeClient(tables: Record<string, Row[]>): SnapshotClient & { reads: string[] } {
  const reads: string[] = [];
  const client = {
    reads,
    from(table: string) {
      return {
        select(cols: string) {
          reads.push(`${table}:${cols}`);
          const filters: ((r: Row) => boolean)[] = [];
          let range: [number, number] | null = null;
          let orderCol: string | null = null;
          const chain: any = {
            eq(col: string, v: unknown) {
              filters.push((r) => r[col] === v);
              return chain;
            },
            not(col: string, op: string, v: unknown) {
              if (op === "is" && v === null) filters.push((r) => r[col] != null);
              else if (op === "in") {
                const list = String(v).replace(/[()"]/g, "").split(",");
                filters.push((r) => !list.includes(String(r[col])));
              }
              return chain;
            },
            gte(col: string, v: string) {
              filters.push((r) => typeof r[col] === "string" && Date.parse(r[col] as string) >= Date.parse(v));
              return chain;
            },
            lt(col: string, v: string) {
              filters.push((r) => typeof r[col] === "string" && Date.parse(r[col] as string) < Date.parse(v));
              return chain;
            },
            limit() {
              return chain;
            },
            order(col: string) {
              orderCol = col;
              return chain;
            },
            range(from: number, to: number) {
              range = [from, to];
              return chain;
            },
            then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
              try {
                let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
                if (orderCol) {
                  const c = orderCol;
                  rows = [...rows].sort((x, y) => String(x[c] ?? "").localeCompare(String(y[c] ?? "")));
                }
                const [from, to] = range ?? [0, 999];
                rows = rows.slice(from, Math.min(to + 1, from + 1000));
                return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
              } catch (e) {
                return Promise.reject(e).then(resolve, reject);
              }
            },
          };
          return chain;
        },
      };
    },
  };
  return client as unknown as SnapshotClient & { reads: string[] };
}

describe("computeGrowthSnapshot active_subscriptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T18:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function scenario() {
    const subscriptions: Row[] = [];
    const orders: Row[] = [];
    // 1200 long-time payers (more than one 1000-row page).
    for (let i = 0; i < 1200; i++) {
      const id = `p${String(i).padStart(4, "0")}`;
      subscriptions.push({ ls_subscription_id: id, status: "active", user_id: `u${id}` });
      orders.push({ ls_subscription_id: id, user_id: `u${id}`, status: "paid", total: 2900, created_at: "2026-09-15T12:00:00Z" });
    }
    // Joined this month: in today's count, not in the start-of-month count.
    subscriptions.push({ ls_subscription_id: "new", status: "active", user_id: "unew" });
    orders.push({ ls_subscription_id: "new", user_id: "unew", status: "paid", total: 2900, created_at: "2026-11-05T12:00:00Z" });
    // Left this month: in the start-of-month count, not today's.
    subscriptions.push({ ls_subscription_id: "gone", status: "expired", ends_at: "2026-11-04T00:00:00Z", user_id: "ugone" });
    orders.push({ ls_subscription_id: "gone", user_id: "ugone", status: "paid", total: 2900, created_at: "2026-10-04T12:00:00Z" });
    // A 100%-off comp: active, never charged.
    subscriptions.push({ ls_subscription_id: "comp", status: "active", user_id: "ucomp" });
    orders.push({ ls_subscription_id: "comp", user_id: "ucomp", status: "paid", total: 0, created_at: "2026-10-01T12:00:00Z" });
    return { subscriptions, orders };
  }

  it("previous is the paying headcount at the start of the month, paged past 1000 rows", async () => {
    const client = fakeClient(scenario());
    const snap = (await computeGrowthSnapshot(client, "2026-11", undefined, new Set(["comp"])))!;
    expect(snap.metrics.active_subscriptions.current).toBe(1201); // 1200 + new
    expect(snap.metrics.active_subscriptions.previous).toBe(1201); // 1200 + gone
    expect(snap.metrics.active_subscriptions.previousToDate).toBe(1201);
  });

  it("keeps comps out of today's count when the comp list could not be read", async () => {
    const client = fakeClient(scenario());
    const snap = (await computeGrowthSnapshot(client, "2026-11", undefined, null))!;
    expect(snap.compsKnown).toBe(false);
    expect(snap.metrics.active_subscriptions.current).toBe(1201);
    expect(snap.metrics.active_subscriptions.previous).toBe(1201);
  });

  it("a historical month gets its own start-of-month count", async () => {
    const client = fakeClient(scenario());
    const snap = (await computeGrowthSnapshot(client, "2026-10", undefined, new Set(["comp"])))!;
    // Oct 1: only the 1200 Sept payers had paid ("gone" first paid Oct 4).
    expect(snap.metrics.active_subscriptions.previous).toBe(1200);
    expect(snap.metrics.active_subscriptions.previousToDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Goals: live baselines
// ---------------------------------------------------------------------------

function snapshotWith(metrics: Record<string, { current: number | null; previous: number | null }>): GrowthSnapshot {
  const m: GrowthSnapshot["metrics"] = {};
  for (const [k, v] of Object.entries(metrics)) m[k] = { ...v, series: null };
  return {
    month: "2026-11",
    prevMonth: "2026-10",
    migrationPending: false,
    comparison: null,
    metrics: m,
    projection: null,
    planBreakdown: null,
    compsKnown: true,
  };
}

function goalsClient(rows: Row[], marker: Row | null = null) {
  const upserts: { table: string; rows: unknown }[] = [];
  const client: GoalsClient = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              const res = Promise.resolve({ data: table === "growth_goals" ? rows : [], error: null });
              return Object.assign(res, {
                maybeSingle: async () => ({ data: marker, error: null }),
              });
            },
          };
        },
        async upsert(r: unknown) {
          upserts.push({ table, rows: r });
          return { error: null };
        },
        update() {
          return { eq: () => ({ is: async () => ({ error: null }) }) };
        },
      };
    },
  } as unknown as GoalsClient;
  return { client, upserts };
}

describe("goal baselines", () => {
  it("liveBaseline reads the snapshot's previous value", () => {
    const snap = snapshotWith({ trials_started: { current: 4, previous: 9 } });
    expect(liveBaseline("trials_started", snap)).toBe(9);
    expect(liveBaseline("missing", snap)).toBeNull();
  });

  it("cards show the live figure, not the frozen seed-time baseline, and keep the saved target", async () => {
    const snap = snapshotWith({
      active_subscriptions: { current: 50, previous: 48 },
      new_subscriptions: { current: 2, previous: 6 },
      revenue_cents: { current: 1000, previous: null },
    });
    const { client } = goalsClient([
      { id: "g1", metric: "active_subscriptions", target: 57, baseline: 51, status: "suggested" },
      { id: "g2", metric: "new_subscriptions", target: 40, baseline: 36, status: "accepted" },
      { id: "g3", metric: "revenue_cents", target: 5000, baseline: 4000, status: "suggested" },
    ]);
    const { goals } = await loadGoalsWithAchievements(client, "2026-11", snap);
    const by = Object.fromEntries(goals!.map((g) => [g.metric, g]));
    expect(by.active_subscriptions.baseline).toBe(48);
    expect(by.active_subscriptions.target).toBe(57);
    expect(by.new_subscriptions.baseline).toBe(6);
    expect(by.new_subscriptions.target).toBe(40);
    // Snapshot could not say: fall back to the saved value.
    expect(by.revenue_cents.baseline).toBe(4000);
  });

  it("new suggestions baseline active subscribers on the start-of-month count", async () => {
    const snap = snapshotWith({
      active_subscriptions: { current: 53, previous: 50 },
      trials_started: { current: 1, previous: 10 },
    });
    const { client, upserts } = goalsClient([]);
    await ensureSuggestions(client, "2026-11", snap);
    const goalRows = upserts.find((u) => u.table === "growth_goals")!.rows as Row[];
    const active = goalRows.find((r) => r.metric === "active_subscriptions")!;
    expect(active.baseline).toBe(50);
    expect(active.target).toBe(55);
    expect(goalRows.find((r) => r.metric === "trials_started")!.baseline).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Foyer route: Denver month edges
// ---------------------------------------------------------------------------

describe("GET /api/admin/growth/foyer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 21:00 MST on Nov 30 is already Dec 1 in UTC.
    vi.setSystemTime(new Date("2026-12-01T04:00:00Z"));
    vi.mocked(callLinksAdmin).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries the Denver month and the Denver month before it", async () => {
    vi.mocked(callLinksAdmin).mockImplementation(async () => ({
      ok: true,
      data: {
        current: { commissionCents: 100, grossCents: 1000, sellers: 1, salesCount: 2 },
        series: [
          { bucket: "2026-11-01", commissionCents: 10, grossCents: 0 },
          { bucket: "2026-11-30", commissionCents: 20, grossCents: 0 },
          { bucket: "2026-12-01", commissionCents: 5, grossCents: 0 },
        ],
      },
    }) as never);

    const res = await foyerGET(new Request("https://www.example.test/api/admin/growth/foyer"));
    const json = await res.json();
    // Default month is the Denver month (still November), not UTC's December.
    expect(json.month).toBe("2026-11");

    const calls = vi.mocked(callLinksAdmin).mock.calls.map((c) => (c[1] as { query: Record<string, number> }).query);
    expect(calls[0].from).toBe(Date.parse("2026-11-01T06:00:00Z")); // Nov 1 00:00 MDT
    expect(calls[0].to).toBe(Date.parse("2026-12-01T04:00:00Z") + 1); // capped at now
    expect(calls[1].from).toBe(Date.parse("2026-10-01T06:00:00Z")); // Oct 1 00:00 MDT
    expect(calls[1].to).toBe(Date.parse("2026-11-01T06:00:00Z"));

    // 30 days of series; the UTC "Dec 1" bucket folds into Nov 30.
    expect(json.commission.series).toHaveLength(30);
    expect(json.commission.series[0]).toBe(10);
    expect(json.commission.series[29]).toBe(25);
    expect(json.commission.previous).toBe(100);
  });

  it("rejects a malformed month", async () => {
    const res = await foyerGET(new Request("https://www.example.test/api/admin/growth/foyer?month=2026-13"));
    expect(res.status).toBe(400);
  });
});
