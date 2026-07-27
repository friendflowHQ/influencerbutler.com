import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedAvailability, putCachedAvailability } from "./availability-cache";
import { migrate } from "../../storage/schema";

// Minimal chrome.storage.local stub over a plain object, enough for the cache's
// get/set/remove usage in a node test environment.
let store: Record<string, unknown> = {};
const localStub = {
  async get(keys: string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return { ...store };
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in store) out[k] = store[k];
    return out;
  },
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(store, items);
  },
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) delete store[k];
  },
};
vi.stubGlobal("chrome", { storage: { local: localStub } });

beforeEach(() => {
  store = {};
  vi.useRealTimers();
});

describe("availability cache", () => {
  it("round-trips available/unavailable and never caches unknown", async () => {
    await putCachedAvailability("b012345678", {
      UK: "available",
      AU: "unavailable",
      US: "unknown",
    });
    const cached = await getCachedAvailability(["B012345678"], ["UK", "AU", "US"]);
    expect(cached.B012345678?.UK).toBe("available");
    expect(cached.B012345678?.AU).toBe("unavailable");
    expect(cached.B012345678?.US).toBeUndefined();
  });

  it("expires entries after the 48h TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T00:00:00Z"));
    await putCachedAvailability("B012345678", { UK: "available" });
    vi.setSystemTime(new Date("2026-07-28T23:59:00Z"));
    expect((await getCachedAvailability(["B012345678"], ["UK"])).B012345678?.UK).toBe(
      "available",
    );
    vi.setSystemTime(new Date("2026-07-29T00:01:00Z"));
    expect((await getCachedAvailability(["B012345678"], ["UK"])).B012345678).toBeUndefined();
  });

  it("misses read as absent, not unknown", async () => {
    const cached = await getCachedAvailability(["B012345678"], ["UK"]);
    expect(cached.B012345678).toBeUndefined();
  });
});

describe("settings migration", () => {
  it("backfills availabilityMarkets for older stored state", () => {
    const migrated = migrate({ schemaVersion: 7 } as never);
    expect(migrated.settings.availabilityMarkets).toEqual([]);
  });

  it("keeps stored markets and rejects non-arrays", () => {
    const kept = migrate({
      schemaVersion: 8,
      settings: { availabilityMarkets: ["UK", "AU"] },
    } as never);
    expect(kept.settings.availabilityMarkets).toEqual(["UK", "AU"]);
    const fixed = migrate({
      schemaVersion: 8,
      settings: { availabilityMarkets: "UK" },
    } as never);
    expect(fixed.settings.availabilityMarkets).toEqual([]);
  });
});
