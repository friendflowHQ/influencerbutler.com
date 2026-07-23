import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkForUpdate,
  compareVersions,
  getUpdateStateView,
  noteUpdateAvailable,
  remindUpdateLater,
  updateDue,
  type UpdateState,
} from "./update";
import { UPDATE_REMIND_MS, UPDATE_STORAGE_KEY } from "../shared/constants";

// In-memory chrome.storage.local plus a stubbable manifest/requestUpdateCheck,
// mirroring the links.test.ts convention of stubbing globals per test.
function stubChrome(opts: {
  manifest?: { version: string; update_url?: string };
  requestUpdateCheck?: ReturnType<typeof vi.fn>;
  stored?: Record<string, unknown>;
}) {
  const stored: Record<string, unknown> = { ...opts.stored };
  const chromeStub = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete stored[key];
        }),
      },
    },
    runtime: {
      getManifest: () => opts.manifest ?? { version: "0.1.4" },
      requestUpdateCheck: opts.requestUpdateCheck ?? vi.fn(),
    },
  };
  vi.stubGlobal("chrome", chromeStub);
  return { stored, chromeStub };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compareVersions", () => {
  it("orders dotted versions numerically, not lexically", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.9", "0.1.10")).toBeLessThan(0);
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
  });
});

describe("updateDue", () => {
  const state = (over: Partial<UpdateState> = {}): UpdateState => ({
    availableVersion: "0.2.0",
    detectedAt: 1000,
    remindAfter: null,
    ...over,
  });

  it("is false with no recorded state", () => {
    expect(updateDue(null, "0.1.4", 5000)).toBe(false);
  });

  it("is false once the running version has caught up", () => {
    expect(updateDue(state({ availableVersion: "0.1.4" }), "0.1.4", 5000)).toBe(false);
    expect(updateDue(state({ availableVersion: "0.1.3" }), "0.1.4", 5000)).toBe(false);
  });

  it("respects an active snooze and expires it", () => {
    expect(updateDue(state({ remindAfter: 9000 }), "0.1.4", 5000)).toBe(false);
    expect(updateDue(state({ remindAfter: 9000 }), "0.1.4", 9001)).toBe(true);
  });

  it("is true for a newer version with no snooze", () => {
    expect(updateDue(state(), "0.1.4", 5000)).toBe(true);
  });
});

describe("noteUpdateAvailable", () => {
  it("records the staged version", async () => {
    const { stored } = stubChrome({});
    await noteUpdateAvailable("0.2.0");
    expect(stored[UPDATE_STORAGE_KEY]).toMatchObject({
      availableVersion: "0.2.0",
      remindAfter: null,
    });
  });

  it("keeps an existing snooze when re-detecting the same version", async () => {
    const { stored } = stubChrome({
      stored: {
        [UPDATE_STORAGE_KEY]: { availableVersion: "0.2.0", detectedAt: 1, remindAfter: 999 },
      },
    });
    await noteUpdateAvailable("0.2.0");
    expect(stored[UPDATE_STORAGE_KEY]).toMatchObject({
      availableVersion: "0.2.0",
      remindAfter: 999,
    });
  });

  it("resets the snooze when a newer version is staged", async () => {
    const { stored } = stubChrome({
      stored: {
        [UPDATE_STORAGE_KEY]: { availableVersion: "0.2.0", detectedAt: 1, remindAfter: 999 },
      },
    });
    await noteUpdateAvailable("0.3.0");
    expect(stored[UPDATE_STORAGE_KEY]).toMatchObject({
      availableVersion: "0.3.0",
      remindAfter: null,
    });
  });
});

describe("getUpdateStateView", () => {
  it("reports a due update with both versions", async () => {
    stubChrome({
      manifest: { version: "0.1.4" },
      stored: {
        [UPDATE_STORAGE_KEY]: { availableVersion: "0.2.0", detectedAt: 1, remindAfter: null },
      },
    });
    const view = await getUpdateStateView();
    expect(view).toEqual({ due: true, availableVersion: "0.2.0", currentVersion: "0.1.4" });
  });

  it("clears the record once the update has been applied", async () => {
    const { stored } = stubChrome({
      manifest: { version: "0.2.0" },
      stored: {
        [UPDATE_STORAGE_KEY]: { availableVersion: "0.2.0", detectedAt: 1, remindAfter: null },
      },
    });
    const view = await getUpdateStateView();
    expect(view).toEqual({ due: false, availableVersion: null, currentVersion: "0.2.0" });
    expect(stored[UPDATE_STORAGE_KEY]).toBeUndefined();
  });
});

describe("remindUpdateLater", () => {
  it("sets the snooze window from now", async () => {
    const { stored } = stubChrome({
      stored: {
        [UPDATE_STORAGE_KEY]: { availableVersion: "0.2.0", detectedAt: 1, remindAfter: null },
      },
    });
    const before = Date.now();
    await remindUpdateLater();
    const state = stored[UPDATE_STORAGE_KEY] as UpdateState;
    expect(state.remindAfter).toBeGreaterThanOrEqual(before + UPDATE_REMIND_MS);
  });

  it("is a no-op with nothing recorded", async () => {
    const { stored } = stubChrome({});
    await remindUpdateLater();
    expect(stored[UPDATE_STORAGE_KEY]).toBeUndefined();
  });
});

describe("checkForUpdate", () => {
  it("never asks Chrome on an unpacked install (no update_url)", async () => {
    const requestUpdateCheck = vi.fn();
    stubChrome({ manifest: { version: "0.1.4" }, requestUpdateCheck });
    await checkForUpdate();
    expect(requestUpdateCheck).not.toHaveBeenCalled();
  });

  it("records the version when Chrome reports update_available", async () => {
    const requestUpdateCheck = vi.fn(async () => ({
      status: "update_available",
      version: "0.2.0",
    }));
    const { stored } = stubChrome({
      manifest: { version: "0.1.4", update_url: "https://clients2.google.com/service/update2/crx" },
      requestUpdateCheck,
    });
    await checkForUpdate();
    expect(stored[UPDATE_STORAGE_KEY]).toMatchObject({ availableVersion: "0.2.0" });
  });

  it("stays silent on no_update and throttled", async () => {
    for (const status of ["no_update", "throttled"]) {
      const requestUpdateCheck = vi.fn(async () => ({ status }));
      const { stored } = stubChrome({
        manifest: { version: "0.1.4", update_url: "https://example.invalid/update" },
        requestUpdateCheck,
      });
      await checkForUpdate();
      expect(stored[UPDATE_STORAGE_KEY]).toBeUndefined();
    }
  });
});
