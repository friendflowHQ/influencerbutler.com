import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_YOUTUBE_BUTLER_STATE, type StorageShape } from "../storage/schema";

// Offline-capable sync for YouTube Butler's own settings: every edit marks a
// dotted-path field "pending", a push sends ONLY those fields (sparse, since
// presence already means explicit intent), and a pull refreshes anything NOT
// currently pending. These cover the three functions in isolation against a
// mocked storage + bridge, mirroring the pattern in
// integrations-desktop-connection.test.ts.

let state: StorageShape;

vi.mock("../storage/store", () => ({
  getState: () => Promise.resolve(state),
  patchState: (patch: (s: StorageShape) => void) => {
    patch(state);
    return Promise.resolve(state);
  },
}));

const fetchDesktopSettings = vi.fn();
const pushDesktopSettings = vi.fn();
const isPaired = vi.fn();
vi.mock("./hud-bridge", () => ({ fetchDesktopSettings, pushDesktopSettings, isPaired }));

async function load() {
  return import("./youtube-butler-settings");
}

function freshState(): StorageShape {
  return {
    youtubeButler: structuredClone(DEFAULT_YOUTUBE_BUTLER_STATE),
  } as unknown as StorageShape;
}

beforeEach(() => {
  vi.resetModules();
  state = freshState();
  fetchDesktopSettings.mockReset();
  pushDesktopSettings.mockReset();
  isPaired.mockReset();
});

describe("patchYtbSetting", () => {
  it("writes a settings field immediately and marks it pending", async () => {
    const { patchYtbSetting } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    expect(state.youtubeButler.settings.uploadVisibility).toBe("public");
    expect(state.youtubeButler.pendingFields).toEqual(["uploadVisibility"]);
  });

  it("writes a nested settings field by dotted path", async () => {
    const { patchYtbSetting } = await load();
    await patchYtbSetting("uploadCap.maxPerDay", 5);
    expect(state.youtubeButler.settings.uploadCap).toEqual({ maxPerDay: 5, rampEnabled: true });
    expect(state.youtubeButler.pendingFields).toEqual(["uploadCap.maxPerDay"]);
  });

  it("writes a schedule field under the schedule. prefix, not into settings", async () => {
    const { patchYtbSetting } = await load();
    await patchYtbSetting("schedule.every", 3);
    expect(state.youtubeButler.schedule.every).toBe(3);
    expect((state.youtubeButler.settings as unknown as Record<string, unknown>).schedule).toBeUndefined();
    expect(state.youtubeButler.pendingFields).toEqual(["schedule.every"]);
  });

  it("never duplicates a path already pending", async () => {
    const { patchYtbSetting } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    await patchYtbSetting("uploadVisibility", "private");
    expect(state.youtubeButler.pendingFields).toEqual(["uploadVisibility"]);
    expect(state.youtubeButler.settings.uploadVisibility).toBe("private");
  });
});

describe("buildYtbPushPayload", () => {
  it("returns null when nothing is pending", async () => {
    const { buildYtbPushPayload } = await load();
    expect(await buildYtbPushPayload()).toBeNull();
  });

  it("projects only the pending fields, nested fields included", async () => {
    const { patchYtbSetting, buildYtbPushPayload } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    await patchYtbSetting("uploadCap.maxPerDay", 5);
    await patchYtbSetting("schedule.every", 2);
    const payload = await buildYtbPushPayload();
    expect(payload).toEqual({
      settings: { uploadVisibility: "public", uploadCap: { maxPerDay: 5 } },
      schedule: { every: 2 },
      channel: null,
    });
  });
});

describe("pullYtbSettingsIfAvailable", () => {
  it("refreshes a non-pending field from the desktop's value", async () => {
    fetchDesktopSettings.mockResolvedValue({
      status: "ok",
      payload: {
        youtubeButler: {
          settings: { uploadVisibility: "private" },
          schedule: { enabled: true, schedule: { every: 2, unit: "days" }, armed: true, nextRunAt: 123, lastRunAt: null, lastError: "" },
          channel: { authenticated: true, channelName: "Desktop Channel" },
        },
      },
    });
    const { pullYtbSettingsIfAvailable } = await load();
    const result = await pullYtbSettingsIfAvailable();
    expect(result).toBe("ok");
    expect(state.youtubeButler.settings.uploadVisibility).toBe("private");
    expect(state.youtubeButler.schedule).toMatchObject({ enabled: true, every: 2, unit: "days", armed: true, nextRunAt: 123 });
    expect(state.youtubeButler.channel).toEqual({ authenticated: true, channelName: "Desktop Channel" });
  });

  it("leaves a pending field alone (the local edit wins until pushed)", async () => {
    const { patchYtbSetting, pullYtbSettingsIfAvailable } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    fetchDesktopSettings.mockResolvedValue({
      status: "ok",
      payload: { youtubeButler: { settings: { uploadVisibility: "private" }, schedule: null, channel: null } },
    });
    await pullYtbSettingsIfAvailable();
    expect(state.youtubeButler.settings.uploadVisibility).toBe("public"); // not overwritten
  });

  it("leaves a pending nested field alone while a sibling still refreshes", async () => {
    const { patchYtbSetting, pullYtbSettingsIfAvailable } = await load();
    await patchYtbSetting("uploadCap.maxPerDay", 5);
    fetchDesktopSettings.mockResolvedValue({
      status: "ok",
      payload: {
        youtubeButler: {
          settings: { uploadCap: { maxPerDay: 99, rampEnabled: false } },
          schedule: null,
          channel: null,
        },
      },
    });
    await pullYtbSettingsIfAvailable();
    expect(state.youtubeButler.settings.uploadCap).toEqual({ maxPerDay: 5, rampEnabled: false });
  });

  it("is a no-op when unpaired or the app is unavailable", async () => {
    fetchDesktopSettings.mockResolvedValue({ status: "not-paired" });
    const { pullYtbSettingsIfAvailable } = await load();
    expect(await pullYtbSettingsIfAvailable()).toBe("not-paired");
    expect(state.youtubeButler.lastPullAt).toBeNull();
  });

  it("returns no-data on an older desktop build that never sends youtubeButler", async () => {
    fetchDesktopSettings.mockResolvedValue({ status: "ok", payload: {} });
    const { pullYtbSettingsIfAvailable } = await load();
    expect(await pullYtbSettingsIfAvailable()).toBe("no-data");
  });
});

describe("reconcileYtbSettingsPush", () => {
  it("is a no-op when nothing is pending", async () => {
    const { reconcileYtbSettingsPush } = await load();
    await reconcileYtbSettingsPush();
    expect(pushDesktopSettings).not.toHaveBeenCalled();
  });

  it("pushes pending fields and clears them on success", async () => {
    isPaired.mockResolvedValue(true);
    pushDesktopSettings.mockResolvedValue({ status: "ok", applied: 1 });
    fetchDesktopSettings.mockResolvedValue({ status: "ok", payload: { youtubeButler: { settings: {}, schedule: null, channel: null } } });
    const { patchYtbSetting, reconcileYtbSettingsPush } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    await reconcileYtbSettingsPush();
    expect(pushDesktopSettings).toHaveBeenCalledWith(
      { youtubeButler: { settings: { uploadVisibility: "public" }, schedule: null, channel: null } },
      "overwrite",
    );
    expect(state.youtubeButler.pendingFields).toEqual([]);
    expect(state.youtubeButler.lastPushedAt).not.toBeNull();
    expect(state.youtubeButler.lastPushError).toBeNull();
  });

  it("records not-paired and leaves fields pending for the next tick", async () => {
    isPaired.mockResolvedValue(false);
    const { patchYtbSetting, reconcileYtbSettingsPush } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    await reconcileYtbSettingsPush();
    expect(pushDesktopSettings).not.toHaveBeenCalled();
    expect(state.youtubeButler.pendingFields).toEqual(["uploadVisibility"]);
    expect(state.youtubeButler.lastPushError).toBe("not-paired");
  });

  it("records a failure status and leaves fields pending to retry", async () => {
    isPaired.mockResolvedValue(true);
    pushDesktopSettings.mockResolvedValue({ status: "app-unavailable" });
    const { patchYtbSetting, reconcileYtbSettingsPush } = await load();
    await patchYtbSetting("uploadVisibility", "public");
    await reconcileYtbSettingsPush();
    expect(state.youtubeButler.pendingFields).toEqual(["uploadVisibility"]);
    expect(state.youtubeButler.lastPushError).toBe("app-unavailable");
  });
});
