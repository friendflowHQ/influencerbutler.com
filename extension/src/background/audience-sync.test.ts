import { beforeEach, describe, expect, it, vi } from "vitest";

// The "Who buys this" card leans on the creator's audience profile from the
// paired app. These cover the cache shape, the settings.get coercion, and the
// throttled background refresh (a no-op when the app was never paired).

const store: Record<string, unknown> = {};
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}),
      set: (items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      },
      remove: (key: string) => {
        delete store[key];
        return Promise.resolve();
      },
    },
  },
});

const isPaired = vi.fn();
const fetchDesktopSettings = vi.fn();
vi.mock("./hud-bridge", () => ({ isPaired, fetchDesktopSettings }));

const { coerceAudienceProfile, loadAudienceProfile, saveAudienceProfile, AUDIENCE_PROFILE_KEY } = await import(
  "../shared/audience-profile"
);
const { coerceSyncPayload } = await import("../tools/settings-sync/merge");
const { refreshAudienceProfile, resetAudienceRefreshForTest } = await import("./audience-sync");
const { inferShopperMix } = await import("../shared/shopper-generation");

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  isPaired.mockReset();
  fetchDesktopSettings.mockReset();
  resetAudienceRefreshForTest();
});

describe("audience profile", () => {
  it("coerces to the four generations and rejects empty / malformed", () => {
    expect(coerceAudienceProfile({ boomer: 150, genx: -1, millennial: "40", genz: 10, x: 9 })).toEqual({
      boomer: 100,
      genx: 0,
      millennial: 40,
      genz: 10,
    });
    expect(coerceAudienceProfile({ boomer: 0 })).toBeNull();
    expect(coerceAudienceProfile("nope")).toBeNull();
  });

  it("round-trips through storage and null clears it", async () => {
    await saveAudienceProfile({ boomer: 60, genx: 20, millennial: 15, genz: 5 });
    expect(await loadAudienceProfile()).toEqual({ boomer: 60, genx: 20, millennial: 15, genz: 5 });
    await saveAudienceProfile(null);
    expect(await loadAudienceProfile()).toBeNull();
  });

  it("settings.get keeps undefined (older app) apart from null (no profile)", () => {
    expect(coerceSyncPayload({})?.audienceProfile).toBeUndefined();
    expect(coerceSyncPayload({ audienceProfile: null })?.audienceProfile).toBeNull();
    expect(coerceSyncPayload({ audienceProfile: { genz: 100 } })?.audienceProfile).toEqual({
      boomer: 0,
      genx: 0,
      millennial: 0,
      genz: 100,
    });
  });

  it("a profile tunes the estimate and marks it", () => {
    const product = { category: "Walkers", priceCents: 6000 };
    const plain = inferShopperMix(product);
    const tuned = inferShopperMix(product, { boomer: 0, genx: 0, millennial: 0, genz: 100 });
    expect(plain.reasons).not.toContain("creatorAudience");
    expect(tuned.reasons).toContain("creatorAudience");
    expect(tuned.mix.genz).toBeGreaterThan(plain.mix.genz);
  });
});

describe("refreshAudienceProfile", () => {
  it("does nothing when not paired", async () => {
    isPaired.mockResolvedValue(false);
    await refreshAudienceProfile(1_000_000_000);
    expect(fetchDesktopSettings).not.toHaveBeenCalled();
  });

  it("pulls when paired, then throttles", async () => {
    isPaired.mockResolvedValue(true);
    fetchDesktopSettings.mockResolvedValue({ status: "app-unavailable" });
    await refreshAudienceProfile(1_000_000_000);
    await refreshAudienceProfile(1_000_000_000 + 60_000);
    expect(fetchDesktopSettings).toHaveBeenCalledTimes(1);
  });

  it("skips while the cached profile is fresh", async () => {
    isPaired.mockResolvedValue(true);
    store[AUDIENCE_PROFILE_KEY] = { profile: { boomer: 1, genx: 0, millennial: 0, genz: 0 }, at: 1_000_000_000 };
    await refreshAudienceProfile(1_000_000_000 + 60_000);
    expect(fetchDesktopSettings).not.toHaveBeenCalled();
  });
});
