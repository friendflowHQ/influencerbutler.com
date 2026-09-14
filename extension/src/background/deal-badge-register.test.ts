import { afterEach, describe, expect, it, vi } from "vitest";

// Deal badge content-script registration: keeps the dynamic
// chrome.scripting registration in sync with curated + saved sources, but
// only for origins the extension already holds host permission for.

const getDealSources = vi.fn();
const hasOriginPermission = vi.fn();
const getSettings = vi.fn();

vi.mock("./deal-harvest", () => ({ getDealSources, hasOriginPermission }));
vi.mock("../storage/store", () => ({ getSettings }));

async function importSync() {
  const mod = await import("./deal-badge-register");
  return mod.syncDealBadgeContentScripts;
}

describe("syncDealBadgeContentScripts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers a script for granted curated + saved origins, skipping ungranted ones", async () => {
    getDealSources.mockResolvedValue([
      { url: "https://www.savewithcindy.shop/", label: "Save With Cindy" },
      { url: "https://www.jungle.deals/", label: "Jungle.Deals" },
    ]);
    getSettings.mockResolvedValue({ dealSources: ["https://saved-not-granted.example/"] });
    hasOriginPermission.mockImplementation(async (url: string) =>
      url.includes("savewithcindy"),
    );

    const register = vi.fn(async () => {});
    vi.stubGlobal("chrome", {
      scripting: {
        registerContentScripts: register,
        updateContentScripts: vi.fn(),
        unregisterContentScripts: vi.fn(),
        getRegisteredContentScripts: vi.fn(async () => []),
      },
    });

    const sync = await importSync();
    await sync();

    expect(register).toHaveBeenCalledTimes(1);
    const call = register.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(call[0][0]).toMatchObject({
      id: "deal-badge",
      js: ["deal-badge.js"],
      matches: ["https://www.savewithcindy.shop/*"],
    });
  });

  it("updates (not registers) when a script is already registered", async () => {
    getDealSources.mockResolvedValue([{ url: "https://www.savewithcindy.shop/", label: "x" }]);
    getSettings.mockResolvedValue({ dealSources: [] });
    hasOriginPermission.mockResolvedValue(true);

    const update = vi.fn(async () => {});
    const register = vi.fn(async () => {});
    vi.stubGlobal("chrome", {
      scripting: {
        registerContentScripts: register,
        updateContentScripts: update,
        unregisterContentScripts: vi.fn(),
        getRegisteredContentScripts: vi.fn(async () => [{ id: "deal-badge" }]),
      },
    });

    const sync = await importSync();
    await sync();

    expect(update).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it("unregisters when no source has a granted permission", async () => {
    getDealSources.mockResolvedValue([{ url: "https://www.savewithcindy.shop/", label: "x" }]);
    getSettings.mockResolvedValue({ dealSources: [] });
    hasOriginPermission.mockResolvedValue(false);

    const unregister = vi.fn(async () => {});
    vi.stubGlobal("chrome", {
      scripting: {
        registerContentScripts: vi.fn(),
        updateContentScripts: vi.fn(),
        unregisterContentScripts: unregister,
        getRegisteredContentScripts: vi.fn(async () => [{ id: "deal-badge" }]),
      },
    });

    const sync = await importSync();
    await sync();

    expect(unregister).toHaveBeenCalledWith({ ids: ["deal-badge"] });
  });

  it("no-ops on Chrome versions without chrome.scripting.registerContentScripts", async () => {
    getDealSources.mockResolvedValue([]);
    getSettings.mockResolvedValue({ dealSources: [] });
    vi.stubGlobal("chrome", { scripting: {} });

    const sync = await importSync();
    await expect(sync()).resolves.toBeUndefined();
  });
});
