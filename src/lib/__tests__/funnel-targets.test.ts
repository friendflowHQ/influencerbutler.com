import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TARGET,
  FUNNEL_TARGETS_KEY,
  applyTarget,
  clampTarget,
  getFunnelTargets,
  isValidTargetKey,
  parseTargetValue,
  parseTargets,
  setFunnelTarget,
  targetFor,
} from "@/lib/funnel-targets";

const SEQ = "seq:3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f";

describe("parseTargets", () => {
  it("defaults to 0.8 per metric", () => {
    expect(DEFAULT_TARGET).toBe(0.8);
    expect(targetFor({}, "system:trial")).toEqual({ activation: 0.8, paid: 0.8 });
    const t = parseTargets({ "system:trial": { activation: 0.5 } });
    expect(targetFor(t, "system:trial")).toEqual({ activation: 0.5, paid: 0.8 });
  });

  it("clamps out-of-range values and ignores garbage", () => {
    const t = parseTargets({
      "system:trial": { activation: 5, paid: -1 },
      "system:pro": { activation: "nope", paid: "0.25" },
      "bad key": { activation: 0.1 },
      [SEQ]: { activation: 0.3, paid: 0.2, updated_at: "2026-11-08T00:00:00Z", updated_by: "me@x.com" },
      "system:onboarding": "string",
    });
    expect(t["system:trial"]).toMatchObject({ activation: 1, paid: 0.01 });
    expect(t["system:pro"]).toMatchObject({ activation: 0.8, paid: 0.25 });
    expect(t["bad key"]).toBeUndefined();
    expect(t["system:onboarding"]).toBeUndefined();
    expect(t[SEQ]).toEqual({ activation: 0.3, paid: 0.2, updated_at: "2026-11-08T00:00:00Z", updated_by: "me@x.com" });
    expect(parseTargets(null)).toEqual({});
    expect(parseTargets([1, 2])).toEqual({});
    expect(parseTargets("x")).toEqual({});
  });

  it("validates keys and values", () => {
    expect(isValidTargetKey("system:apptrial")).toBe(true);
    expect(isValidTargetKey(SEQ)).toBe(true);
    expect(isValidTargetKey("seq:not-a-uuid")).toBe(false);
    expect(isValidTargetKey("trial")).toBe(false);
    expect(parseTargetValue(0.01)).toBe(0.01);
    expect(parseTargetValue(1)).toBe(1);
    expect(parseTargetValue("0.5")).toBe(0.5);
    expect(parseTargetValue(0)).toBeNull();
    expect(parseTargetValue(80)).toBeNull();
    expect(parseTargetValue(NaN)).toBeNull();
    expect(clampTarget(undefined)).toBe(0.8);
  });

  it("applyTarget changes one metric and stamps the entry", () => {
    const next = applyTarget({}, "system:trial", "paid", 0.12, "me@x.com", "2026-11-08T00:00:00Z");
    expect(next["system:trial"]).toEqual({ activation: 0.8, paid: 0.12, updated_at: "2026-11-08T00:00:00Z", updated_by: "me@x.com" });
  });
});

function fakeDb(stored: unknown, upsertError: unknown = null) {
  const upsert = vi.fn(async () => ({ error: upsertError }));
  const db = {
    from: (table: string) => {
      expect(table).toBe("app_config");
      return {
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => {
              expect(key).toBe(FUNNEL_TARGETS_KEY);
              return { data: stored === undefined ? null : { value: stored }, error: null };
            },
          }),
        }),
        upsert,
      };
    },
  } as unknown as SupabaseClient;
  return { db, upsert };
}

describe("get/set via app_config", () => {
  it("reads the stored value", async () => {
    const { db } = fakeDb({ "system:trial": { activation: 0.4, paid: 0.1 } });
    const t = await getFunnelTargets(db);
    expect(targetFor(t, "system:trial")).toEqual({ activation: 0.4, paid: 0.1 });
    expect(await getFunnelTargets(fakeDb(undefined).db)).toEqual({});
  });

  it("writes a merged value", async () => {
    const { db, upsert } = fakeDb({ "system:trial": { activation: 0.4, paid: 0.1 } });
    const r = await setFunnelTarget(db, "system:pro", "activation", 0.6, "me@x.com");
    expect(r.ok).toBe(true);
    const calls = upsert.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const row = calls[0][0] as { key: string; value: Record<string, { activation: number; paid: number }> };
    expect(row.key).toBe(FUNNEL_TARGETS_KEY);
    expect(row.value["system:trial"]).toMatchObject({ activation: 0.4, paid: 0.1 });
    expect(row.value["system:pro"]).toMatchObject({ activation: 0.6, paid: 0.8, updated_by: "me@x.com" });
  });

  it("rejects bad input with 400 and reports save failures as 500", async () => {
    const { db } = fakeDb({});
    expect(await setFunnelTarget(db, "nope", "paid", 0.5, null)).toMatchObject({ ok: false, status: 400 });
    expect(await setFunnelTarget(db, "system:trial", "clicks", 0.5, null)).toMatchObject({ ok: false, status: 400 });
    expect(await setFunnelTarget(db, "system:trial", "paid", 2, null)).toMatchObject({ ok: false, status: 400 });
    const failing = fakeDb({}, { code: "XX000" });
    expect(await setFunnelTarget(failing.db, "system:trial", "paid", 0.5, null)).toMatchObject({ ok: false, status: 500 });
  });
});
