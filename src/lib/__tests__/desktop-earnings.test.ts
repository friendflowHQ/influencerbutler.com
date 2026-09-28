import { describe, expect, it } from "vitest";
import {
  MAX_ASINS_PER_PERIOD,
  MAX_CENTS,
  MAX_MONTHS,
  normalizeEarningsPayload,
  parseMonthKey,
  parsePeriod,
  sumCategories,
  toCents,
  twelveMonthFloor,
} from "../desktop-earnings";

function month(key: string, overrides: Record<string, unknown> = {}) {
  return {
    month: key,
    onsiteCents: 100,
    ccCents: 200,
    offsiteCents: 0,
    brandDealCents: 0,
    internationalCents: 0,
    bonusCents: 0,
    totalCents: 300,
    ...overrides,
  };
}

function asin(period: string, code: string, rank: number, overrides: Record<string, unknown> = {}) {
  return {
    period,
    asin: code,
    marketplace: "amazon.com",
    title: "Thing",
    imageUrl: "https://m.media-amazon.com/images/I/thing.jpg",
    amountCents: 1000 - rank,
    units: 3,
    orders: 2,
    rank,
    ...overrides,
  };
}

function base(extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    appVersion: "3.4.1",
    syncedAt: "2026-09-08T12:00:00.000Z",
    currency: "usd",
    offsiteTracked: false,
    months: [],
    topAsins: [],
    ...extra,
  };
}

function expectOk(result: ReturnType<typeof normalizeEarningsPayload>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

describe("toCents", () => {
  it("rounds numbers and coerces numeric strings", () => {
    expect(toCents(1234)).toBe(1234);
    expect(toCents(12.6)).toBe(13);
    expect(toCents("250")).toBe(250);
    expect(toCents(" 99.5 ")).toBe(100);
    expect(toCents(-45.4)).toBe(-45);
  });

  it("turns garbage into 0", () => {
    expect(toCents(undefined)).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents("")).toBe(0);
    expect(toCents("abc")).toBe(0);
    expect(toCents(NaN)).toBe(0);
    expect(toCents(Infinity)).toBe(0);
    expect(toCents({})).toBe(0);
  });

  it("clamps to +/- MAX_CENTS", () => {
    expect(toCents(1e20)).toBe(MAX_CENTS);
    expect(toCents(-1e20)).toBe(-MAX_CENTS);
  });
});

describe("parseMonthKey / parsePeriod", () => {
  it("accepts real calendar months and normalises to the first of the month", () => {
    expect(parseMonthKey("2026-09")).toBe("2026-09-01");
    expect(parseMonthKey(" 2024-01 ")).toBe("2024-01-01");
  });

  it("rejects bad months", () => {
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseMonthKey("2026-9")).toBeNull();
    expect(parseMonthKey("2026-09-01")).toBeNull();
    expect(parseMonthKey("1999-12")).toBeNull();
    expect(parseMonthKey(202609)).toBeNull();
    expect(parseMonthKey(null)).toBeNull();
  });

  it("accepts all, 12m and YYYY-MM periods only", () => {
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("12m")).toBe("12m");
    expect(parsePeriod("2026-08")).toBe("2026-08");
    expect(parsePeriod("ALL")).toBeNull();
    expect(parsePeriod("24m")).toBeNull();
    expect(parsePeriod("2026-14")).toBeNull();
    expect(parsePeriod(12)).toBeNull();
  });
});

describe("normalizeEarningsPayload: envelope", () => {
  it("rejects non-objects and unknown versions", () => {
    expect(normalizeEarningsPayload(null)).toEqual({ ok: false, error: expect.any(String) });
    expect(normalizeEarningsPayload([])).toEqual({ ok: false, error: expect.any(String) });
    expect(normalizeEarningsPayload("x")).toEqual({ ok: false, error: expect.any(String) });
    expect(normalizeEarningsPayload({ ...base(), v: 2 })).toMatchObject({ ok: false });
    expect(normalizeEarningsPayload({ ...base(), v: undefined })).toMatchObject({ ok: false });
  });

  it("rejects non-array months / topAsins", () => {
    expect(normalizeEarningsPayload(base({ months: "nope" }))).toMatchObject({ ok: false });
    expect(normalizeEarningsPayload(base({ topAsins: {} }))).toMatchObject({ ok: false });
  });

  it("accepts an empty snapshot and fills in defaults", () => {
    const r = expectOk(normalizeEarningsPayload({ v: 1 }));
    expect(r.months).toEqual([]);
    expect(r.topAsins).toEqual([]);
    expect(r.periods).toEqual([]);
    expect(r.monthRange).toBeNull();
    expect(r.currency).toBe("USD");
    expect(r.appVersion).toBeNull();
    expect(r.offsiteTracked).toBe(false);
    expect(new Date(r.syncedAt).getTime()).not.toBeNaN();
  });

  it("normalises the meta fields", () => {
    const r = expectOk(normalizeEarningsPayload(base({ currency: "gbp", offsiteTracked: true })));
    expect(r.currency).toBe("GBP");
    expect(r.offsiteTracked).toBe(true);
    expect(r.appVersion).toBe("3.4.1");
    expect(r.syncedAt).toBe("2026-09-08T12:00:00.000Z");
    // Non-ISO currency codes and truthy non-booleans fall back safely.
    const r2 = expectOk(normalizeEarningsPayload(base({ currency: "dollars", offsiteTracked: "yes" })));
    expect(r2.currency).toBe("USD");
    expect(r2.offsiteTracked).toBe(false);
    // An unparseable syncedAt becomes "now" rather than failing the sync.
    const r3 = expectOk(normalizeEarningsPayload(base({ syncedAt: "not a date" })));
    expect(new Date(r3.syncedAt).getTime()).not.toBeNaN();
  });
});

describe("normalizeEarningsPayload: months", () => {
  it("drops invalid month rows, dedupes (last wins), sorts ascending and computes the range", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({
          months: [
            month("2026-03"),
            month("2026-13"),
            "garbage",
            null,
            month("2026-01"),
            month("2026-03", { onsiteCents: 999, ccCents: 0, totalCents: 999 }),
            { onsiteCents: 5 },
          ],
        }),
      ),
    );
    expect(r.months.map((m) => m.month)).toEqual(["2026-01-01", "2026-03-01"]);
    expect(r.months[1].onsiteCents).toBe(999);
    expect(r.monthRange).toEqual({ min: "2026-01-01", max: "2026-03-01" });
  });

  it("coerces cents and recomputes a missing total from the categories", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({
          months: [
            {
              month: "2026-05",
              onsiteCents: "1050",
              ccCents: 20.4,
              offsiteCents: "bad",
              brandDealCents: null,
              internationalCents: -10,
              bonusCents: 5,
            },
          ],
        }),
      ),
    );
    expect(r.months[0]).toEqual({
      month: "2026-05-01",
      onsiteCents: 1050,
      ccCents: 20,
      offsiteCents: 0,
      brandDealCents: 0,
      internationalCents: -10,
      bonusCents: 5,
      totalCents: 1065,
    });
  });

  it("keeps an explicit totalCents even when it disagrees with the categories", () => {
    const r = expectOk(normalizeEarningsPayload(base({ months: [month("2026-05", { totalCents: 42 })] })));
    expect(r.months[0].totalCents).toBe(42);
  });

  it("caps to the most recent MAX_MONTHS months", () => {
    const months = [];
    for (let i = 0; i < MAX_MONTHS + 10; i += 1) {
      const y = 2010 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      months.push(month(`${y}-${String(m).padStart(2, "0")}`));
    }
    const r = expectOk(normalizeEarningsPayload(base({ months })));
    expect(r.months).toHaveLength(MAX_MONTHS);
    // The 10 oldest were dropped, so the range starts 10 months in.
    expect(r.monthRange).toEqual({ min: "2010-11-01", max: months[months.length - 1].month + "-01" });
  });
});

describe("normalizeEarningsPayload: top ASINs", () => {
  it("validates asin/period/marketplace and normalises case", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({
          topAsins: [
            asin("all", "b0abc12345", 1, { marketplace: "Amazon.CO.UK" }),
            asin("all", "short", 2),
            asin("never", "B0ABC12346", 3),
            asin("12m", "B0ABC12347", 1, { marketplace: "not a host!" }),
            asin("2026-08", "B0ABC12348", 1, { imageUrl: "http://insecure.example/img.jpg", title: "  " }),
          ],
        }),
      ),
    );
    expect(r.topAsins).toHaveLength(3);
    expect(r.periods).toEqual(["all", "12m", "2026-08"]);
    expect(r.topAsins[0]).toMatchObject({ period: "all", asin: "B0ABC12345", marketplace: "amazon.co.uk", rank: 1 });
    expect(r.topAsins[1]).toMatchObject({ period: "12m", asin: "B0ABC12347", marketplace: "amazon.com" });
    expect(r.topAsins[2]).toMatchObject({ period: "2026-08", asin: "B0ABC12348", imageUrl: null, title: null });
  });

  it("dedupes on (period, asin), sorts by rank and re-numbers ranks densely", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({
          topAsins: [
            asin("all", "B0ABC12345", 7),
            asin("all", "B0ABC12346", 3),
            asin("all", "B0ABC12345", 1, { amountCents: 5 }),
            asin("12m", "B0ABC12346", 9),
          ],
        }),
      ),
    );
    const all = r.topAsins.filter((a) => a.period === "all");
    expect(all.map((a) => [a.asin, a.rank])).toEqual([
      ["B0ABC12345", 1],
      ["B0ABC12346", 2],
    ]);
    expect(all[0].amountCents).toBe(5);
    expect(r.topAsins.filter((a) => a.period === "12m")[0].rank).toBe(1);
  });

  it("coerces counts and falls back to payload order when rank is missing", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({
          topAsins: [
            asin("all", "B0ABC12345", 0, { rank: undefined, units: "9", orders: -4, amountCents: "12.5" }),
            asin("all", "B0ABC12346", 0, { rank: undefined, units: 2.6 }),
          ],
        }),
      ),
    );
    expect(r.topAsins[0]).toMatchObject({ asin: "B0ABC12345", rank: 1, units: 0, orders: 0, amountCents: 13 });
    expect(r.topAsins[1]).toMatchObject({ asin: "B0ABC12346", rank: 2, units: 3 });
  });

  it("caps each period to MAX_ASINS_PER_PERIOD, keeping the best ranks", () => {
    const topAsins = [];
    for (let i = 0; i < MAX_ASINS_PER_PERIOD + 5; i += 1) {
      const code = `B0${String(i).padStart(8, "0")}`;
      topAsins.push(asin("all", code, MAX_ASINS_PER_PERIOD + 5 - i));
      topAsins.push(asin("12m", code, i + 1));
    }
    const r = expectOk(normalizeEarningsPayload(base({ topAsins })));
    const all = r.topAsins.filter((a) => a.period === "all");
    const last12 = r.topAsins.filter((a) => a.period === "12m");
    expect(all).toHaveLength(MAX_ASINS_PER_PERIOD);
    expect(last12).toHaveLength(MAX_ASINS_PER_PERIOD);
    // "all" was posted in reverse rank order; the lowest-ranked (highest numbers) are the ones dropped.
    expect(all[0].asin).toBe(`B0${String(MAX_ASINS_PER_PERIOD + 4).padStart(8, "0")}`);
    expect(all[all.length - 1].rank).toBe(MAX_ASINS_PER_PERIOD);
    expect(last12[0].asin).toBe("B000000000");
  });
});

describe("sumCategories / twelveMonthFloor", () => {
  it("sums every bucket", () => {
    const r = expectOk(
      normalizeEarningsPayload(
        base({ months: [month("2026-01"), month("2026-02", { bonusCents: 50, totalCents: 350 })] }),
      ),
    );
    expect(sumCategories(r.months)).toEqual({
      onsiteCents: 200,
      ccCents: 400,
      offsiteCents: 0,
      brandDealCents: 0,
      internationalCents: 0,
      bonusCents: 50,
      totalCents: 650,
    });
  });

  it("computes a 12-month inclusive window floor across year boundaries", () => {
    expect(twelveMonthFloor("2026-09-01")).toBe("2025-10-01");
    expect(twelveMonthFloor("2026-12-01")).toBe("2026-01-01");
    expect(twelveMonthFloor("2026-01-01")).toBe("2025-02-01");
  });
});
