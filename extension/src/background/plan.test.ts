import { afterEach, describe, expect, it, vi } from "vitest";

const licenseKey = "KEY-1234-5678-ABCD";
const auth: { licenseKey: string | null; planLevel?: string | null } = { licenseKey, planLevel: null };
vi.mock("../storage/store", () => ({
  getState: async () => ({ auth }),
  patchState: async (fn: (s: { auth: typeof auth }) => void) => {
    fn({ auth });
  },
}));

import { getPlanOptions, upgradePlan } from "./plan";
import { normalizePlanLevel, isBeginnerPlan } from "../shared/plan-level";

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe("plan level", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    auth.planLevel = null;
    auth.licenseKey = licenseKey;
  });

  it("normalizes to legacy for anything but beginner / power", () => {
    expect(normalizePlanLevel("beginner")).toBe("beginner");
    expect(normalizePlanLevel(" Power ")).toBe("power");
    for (const v of ["legacy", "gold", "", null, undefined, 3]) expect(normalizePlanLevel(v)).toBe("legacy");
    expect(isBeginnerPlan("beginner")).toBe(true);
    expect(isBeginnerPlan("legacy")).toBe(false);
  });

  it("getPlanOptions forwards the Bearer key, returns the upgrade price and remembers the level", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        ok: true,
        current: { level: "beginner", priceCents: 2499, interval: "month" },
        upgrade: { level: "power", priceCents: 3900, interval: "month" },
        priceChange: { effectiveAt: "2026-11-28T00:00:00.000Z", current: 2900, upgrade: 4900 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await getPlanOptions();
    expect(res).toEqual({
      ok: true,
      level: "beginner",
      upgrade: { priceCents: 3900, interval: "month" },
      priceChange: { upgradeCents: 4900, effectiveAt: "2026-11-28T00:00:00.000Z" },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/extension/plan");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${licenseKey}`);
    expect(auth.planLevel).toBe("beginner");
  });

  it("upgradePlan POSTs target power and flips the remembered level on success only", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, error: "not_eligible" }, 400)));
    expect(await upgradePlan()).toEqual({ ok: false, error: "not_eligible" });
    expect(auth.planLevel).toBeNull();

    const fetchMock = vi.fn(async () => json({ ok: true, level: "power", variantId: 2100003 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await upgradePlan()).toEqual({ ok: true, level: "power" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ target: "power" });
    expect(auth.planLevel).toBe("power");
  });

  it("signed out: both calls answer not_signed_in without a request", async () => {
    auth.licenseKey = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPlanOptions()).toEqual({ ok: false, error: "not_signed_in" });
    expect(await upgradePlan()).toEqual({ ok: false, error: "not_signed_in" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
