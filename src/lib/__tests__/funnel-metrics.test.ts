import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FUNNEL_METRICS,
  activationMetric,
  cohortBounds,
  computeFunnelMetrics,
  countFunnelTotals,
  isMissingSchema,
  metricsFromCohort,
  outcomeWithinWindow,
  paidMetric,
  rate,
  type CohortRow,
} from "@/lib/funnel-metrics";
import { SYSTEM_FUNNELS } from "@/lib/system-funnels";

const DAY = 86_400_000;
const NOW = Date.parse("2026-12-31T12:00:00Z");
const SIGNAL = Date.parse("2026-11-09T00:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

describe("definitions", () => {
  it("every SYSTEM_FUNNELS key has a metric definition (incl. apptrial and upgrade)", () => {
    for (const f of SYSTEM_FUNNELS) expect(FUNNEL_METRICS[f.key as keyof typeof FUNNEL_METRICS], f.key).toBeDefined();
    expect(FUNNEL_METRICS.apptrial.counts.convertedCol).toBe("app_trial_converted_at");
    expect(FUNNEL_METRICS.pro.paidKind).toBe("retention");
    expect(FUNNEL_METRICS.upgrade.paidKind).toBe("upgrade");
  });

  it("rate is null on an empty denominator", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
  });

  it("cohort bounds", () => {
    const b = cohortBounds(NOW, 14);
    expect(b.to).toBe(NOW - 14 * DAY);
    expect(b.from).toBe(NOW - 180 * DAY);
  });
});

describe("activationMetric", () => {
  const rows: CohortRow[] = [
    { email: "a@x.com", enteredAt: ago(30), paid: false }, // activated day 3
    { email: "B@x.com", enteredAt: ago(30), paid: false }, // activated day 20 (too late)
    { email: "c@x.com", enteredAt: ago(30), paid: false }, // never
    { email: "d@x.com", enteredAt: ago(5), paid: false }, // not matured
    { email: "e@x.com", enteredAt: ago(200), paid: false }, // beyond lookback
    { email: "f@x.com", enteredAt: ago(40), paid: false }, // activated before entry
  ];
  const act = new Map<string, string | null>([
    ["a@x.com", ago(27)],
    ["b@x.com", ago(10)],
    ["c@x.com", null],
    ["d@x.com", ago(4)],
    ["f@x.com", ago(45)],
  ]);

  it("counts activated_at within 14 days of entry over the matured cohort", () => {
    expect(activationMetric(rows, act, NOW, SIGNAL)).toEqual({ num: 2, den: 4, rate: 0.5, measurable: true });
  });

  it("excludes cohorts that predate the signal; all-predating -> not measurable", () => {
    const old: CohortRow[] = [{ email: "a@x.com", enteredAt: "2026-10-01T00:00:00Z", paid: false }];
    const now = Date.parse("2026-11-20T00:00:00Z");
    expect(activationMetric(old, new Map(), now, SIGNAL)).toEqual({ num: 0, den: 0, rate: null, measurable: false });
    // Mixed: the pre-signal row drops out, the rest is measured.
    const mixed = [...old, { email: "z@x.com", enteredAt: "2026-11-10T00:00:00Z", paid: false }];
    const later = Date.parse("2026-12-01T00:00:00Z");
    expect(activationMetric(mixed, new Map([["z@x.com", "2026-11-11T00:00:00Z"]]), later, SIGNAL)).toEqual({
      num: 1,
      den: 1,
      rate: 1,
      measurable: true,
    });
    // Empty cohort with nothing pre-signal is measurable, just no data.
    expect(activationMetric([], new Map(), NOW, SIGNAL)).toEqual({ num: 0, den: 0, rate: null, measurable: true });
  });

  it("null lookup (missing migration) -> rate null", () => {
    expect(activationMetric(rows, null, NOW, SIGNAL)).toMatchObject({ rate: null, den: 4 });
  });
});

describe("paidMetric", () => {
  it("uses the funnel maturity window", () => {
    const rows: CohortRow[] = [
      { email: "a", enteredAt: ago(40), paid: true },
      { email: "b", enteredAt: ago(40), paid: false },
      { email: "c", enteredAt: ago(10), paid: true }, // not matured at 21
      { email: "d", enteredAt: null, paid: true },
    ];
    expect(paidMetric(rows, NOW, 21)).toEqual({ num: 1, den: 2, rate: 0.5, measurable: true });
    expect(paidMetric(rows, NOW, 21, false)).toEqual({ num: 0, den: 2, rate: null, measurable: true });
  });

  it("metricsFromCohort: null cohort -> both rates null with paid label", () => {
    const m = metricsFromCohort(FUNNEL_METRICS.pro, null, null, NOW, SIGNAL);
    expect(m.activation.rate).toBeNull();
    expect(m.paid).toMatchObject({ rate: null, kind: "retention" });
  });
});

describe("helpers", () => {
  it("isMissingSchema", () => {
    for (const code of ["42703", "42P01", "PGRST204", "PGRST205"]) expect(isMissingSchema({ code })).toBe(true);
    expect(isMissingSchema({ code: "23505" })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });

  it("outcomeWithinWindow", () => {
    expect(outcomeWithinWindow(ago(20), ago(10), 14)).toBe(true);
    expect(outcomeWithinWindow(ago(20), ago(1), 14)).toBe(false);
    expect(outcomeWithinWindow(ago(20), ago(21), 14)).toBe(false);
    expect(outcomeWithinWindow(null, ago(1), 14)).toBe(false);
  });
});

/** Minimal chainable PostgREST stand-in: every query resolves to `result(table, cols)`. */
function fakeDb(result: (table: string, cols: string) => { data?: unknown; error?: unknown; count?: number }) {
  return {
    from(table: string) {
      let cols = "";
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: (c: string) => {
          cols = c;
          return q;
        },
        gte: chain,
        lte: chain,
        eq: chain,
        in: chain,
        not: chain,
        order: chain,
        range: chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 0, ...result(table, cols) }),
      });
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("DB degradation", () => {
  it("missing table -> null rates, no throw", async () => {
    const db = fakeDb(() => ({ error: { code: "42P01" } }));
    const m = await computeFunnelMetrics(db, "upgrade", NOW, SIGNAL);
    expect(m.activation.rate).toBeNull();
    expect(m.paid.rate).toBeNull();
    const c = await countFunnelTotals(db, "apptrial");
    expect(c).toEqual({ entered: null, converted: null, convertedLabel: "converted" });
  });

  it("conversion falls back when conversion_purchased_at is missing", async () => {
    const db = fakeDb((table, cols) => {
      if (table === "affiliate_applications" && cols.includes("conversion_purchased_at")) return { error: { code: "42703" } };
      if (table === "affiliate_applications") return { data: [{ email: "a@x.com", conversion_email_1h_sent_at: ago(30) }] };
      if (table === "email_subscribers") return { error: { code: "42703" } }; // activated_at missing
      return {};
    });
    const m = await computeFunnelMetrics(db, "conversion", NOW, SIGNAL);
    expect(m.paid).toMatchObject({ den: 1, rate: null });
    expect(m.activation).toMatchObject({ den: 1, rate: null, measurable: true });
  });

  it("apptrial computes both from email_subscribers", async () => {
    const db = fakeDb((table, cols) => {
      if (table === "email_subscribers" && cols.startsWith("email,app_trial")) {
        return {
          data: [
            { email: "a@x.com", app_trial_email_day0_sent_at: ago(40), app_trial_converted_at: ago(30) },
            { email: "b@x.com", app_trial_email_day0_sent_at: ago(40), app_trial_converted_at: null },
          ],
        };
      }
      if (table === "email_subscribers" && cols === "email,activated_at") {
        return { data: [{ email: "a@x.com", activated_at: ago(39) }] };
      }
      if (table === "profiles") return { data: [{ id: "u-a", email: "a@x.com" }, { id: "u-b", email: "b@x.com" }] };
      if (table === "orders") {
        return {
          data: [
            { user_id: "u-a", created_at: ago(30), total: 2499, ls_subscription_id: "123" },
            // A $0 order and a free comp are not purchases.
            { user_id: "u-b", created_at: ago(30), total: 0, ls_subscription_id: "124" },
            { user_id: "u-b", created_at: ago(30), total: 3900, ls_subscription_id: "comp:x" },
          ],
        };
      }
      return {};
    });
    const m = await computeFunnelMetrics(db, "apptrial", NOW, SIGNAL);
    expect(m.paid).toMatchObject({ num: 1, den: 2, rate: 0.5, kind: "purchase" });
    expect(m.activation).toMatchObject({ num: 1, den: 2, rate: 0.5 });
  });

  it("apptrial paid ignores app_trial_converted_at (a free LS trial start)", async () => {
    const db = fakeDb((table, cols) => {
      if (table === "email_subscribers" && cols.startsWith("email,app_trial")) {
        return { data: [{ email: "a@x.com", app_trial_email_day0_sent_at: ago(40), app_trial_converted_at: ago(30) }] };
      }
      if (table === "profiles") return { data: [{ id: "u-a", email: "a@x.com" }] };
      if (table === "orders") return { data: [] };
      return {};
    });
    const m = await computeFunnelMetrics(db, "apptrial", NOW, SIGNAL);
    expect(m.paid).toMatchObject({ num: 0, den: 1, rate: 0 });
  });

  it("winback paid excludes comp claims and needs 20261110", async () => {
    const rows = [
      { user_id: "u-a", winback_t1_sent_at: ago(60), winback_converted_at: ago(50), winback_conversion_kind: "discount" },
      { user_id: "u-b", winback_t1_sent_at: ago(60), winback_converted_at: ago(50), winback_conversion_kind: "comp" },
    ];
    const db = fakeDb((table) => {
      if (table === "subscription_cancel_reasons") return { data: rows };
      if (table === "profiles") return { data: [] };
      return {};
    });
    const m = await computeFunnelMetrics(db, "winback", NOW, SIGNAL);
    expect(m.paid).toMatchObject({ num: 1, den: 2, rate: 0.5 });
    const old = fakeDb((table, cols) => {
      if (table === "subscription_cancel_reasons" && cols.includes("winback_converted_at")) return { error: { code: "42703" } };
      if (table === "subscription_cancel_reasons") return { data: [{ user_id: "u-a", winback_t1_sent_at: ago(60) }] };
      return {};
    });
    expect((await computeFunnelMetrics(old, "winback", NOW, SIGNAL)).paid).toMatchObject({ den: 1, rate: null });
  });
});
