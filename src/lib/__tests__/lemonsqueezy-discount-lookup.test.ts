/**
 * Summary: Unit tests for the LS discount-by-code lookup + cache.
 * Dependencies: vitest, ../lemonsqueezy-discount-lookup, ../lemonsqueezy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchDiscountByCode,
  __resetDiscountLookupCacheForTests,
  DISCOUNT_LOOKUP_CACHE_TTL_MS,
} from "../lemonsqueezy-discount-lookup";

vi.mock("../lemonsqueezy", () => ({
  lsApi: vi.fn(),
}));

import { lsApi } from "../lemonsqueezy";
const lsApiMock = lsApi as unknown as ReturnType<typeof vi.fn>;

type FakeResponseInit = { ok: boolean; status?: number; json?: unknown };
function fakeResponse(init: FakeResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    async json() {
      return init.json ?? {};
    },
    async text() {
      return JSON.stringify(init.json ?? {});
    },
  } as unknown as Response;
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "disc-1",
    attributes: {
      code: "WELCOME30",
      amount: 30,
      amount_type: "percent",
      duration: "once",
      status: "published",
      ...overrides,
    },
  };
}

describe("fetchDiscountByCode", () => {
  beforeEach(() => {
    __resetDiscountLookupCacheForTests();
    lsApiMock.mockReset();
  });

  it("returns null for empty code", async () => {
    const result = await fetchDiscountByCode("", "store-1");
    expect(result).toBeNull();
    expect(lsApiMock).not.toHaveBeenCalled();
  });

  it("returns null for empty storeId", async () => {
    const result = await fetchDiscountByCode("WELCOME30", "");
    expect(result).toBeNull();
    expect(lsApiMock).not.toHaveBeenCalled();
  });

  it("parses a happy-path published once-percent discount", async () => {
    lsApiMock.mockResolvedValue(
      fakeResponse({ ok: true, json: { data: [record()] } }),
    );
    const result = await fetchDiscountByCode("WELCOME30", "store-1");
    expect(result).toEqual({
      id: "disc-1",
      code: "WELCOME30",
      amount: 30,
      amountType: "percent",
      duration: "once",
      durationInMonths: null,
    });
  });

  it("parses a repeating discount with durationInMonths", async () => {
    lsApiMock.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: {
          data: [
            record({
              code: "ANNDEAL",
              duration: "repeating",
              duration_in_months: 12,
              amount: 20,
            }),
          ],
        },
      }),
    );
    const result = await fetchDiscountByCode("ANNDEAL", "store-1");
    expect(result?.duration).toBe("repeating");
    expect(result?.durationInMonths).toBe(12);
  });

  it("filters out unpublished discounts", async () => {
    lsApiMock.mockResolvedValue(
      fakeResponse({ ok: true, json: { data: [record({ status: "draft" })] } }),
    );
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("filters out expired discounts", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    lsApiMock.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: { data: [record({ expires_at: yesterday })] },
      }),
    );
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("filters out not-yet-started discounts", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    lsApiMock.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: { data: [record({ starts_at: tomorrow })] },
      }),
    );
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("returns null when LS returns empty data array", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [] } }));
    expect(await fetchDiscountByCode("BOGUS", "store-1")).toBeNull();
  });

  it("returns null on LS non-2xx", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: false, status: 503, json: {} }));
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    lsApiMock.mockRejectedValue(new Error("network down"));
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("ignores LS substring matches that aren't the exact code", async () => {
    // LS filter[code] does a substring/contains match - make sure we don't
    // accept WELCOME300 when the caller asked for WELCOME30.
    lsApiMock.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: { data: [record({ code: "WELCOME300", amount: 99 })] },
      }),
    );
    expect(await fetchDiscountByCode("WELCOME30", "store-1")).toBeNull();
  });

  it("caches positive results - second call doesn't hit LS", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [record()] } }));
    await fetchDiscountByCode("WELCOME30", "store-1");
    await fetchDiscountByCode("WELCOME30", "store-1");
    expect(lsApiMock).toHaveBeenCalledTimes(1);
  });

  it("caches negative results - second bogus call doesn't hit LS", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [] } }));
    expect(await fetchDiscountByCode("BOGUS", "store-1")).toBeNull();
    expect(await fetchDiscountByCode("BOGUS", "store-1")).toBeNull();
    expect(lsApiMock).toHaveBeenCalledTimes(1);
  });

  it("expires cache after TTL", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [record()] } }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      await fetchDiscountByCode("WELCOME30", "store-1");
      vi.setSystemTime(
        new Date(Date.parse("2026-01-01T00:00:00Z") + DISCOUNT_LOOKUP_CACHE_TTL_MS + 1_000),
      );
      await fetchDiscountByCode("WELCOME30", "store-1");
      expect(lsApiMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cache is keyed by storeId - different stores miss each other", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [record()] } }));
    await fetchDiscountByCode("WELCOME30", "store-1");
    await fetchDiscountByCode("WELCOME30", "store-2");
    expect(lsApiMock).toHaveBeenCalledTimes(2);
  });

  it("cache key is case-insensitive on the code", async () => {
    lsApiMock.mockResolvedValue(fakeResponse({ ok: true, json: { data: [record()] } }));
    await fetchDiscountByCode("WELCOME30", "store-1");
    await fetchDiscountByCode("welcome30", "store-1");
    expect(lsApiMock).toHaveBeenCalledTimes(1);
  });
});
