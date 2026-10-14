import { getState, patchState } from "../storage/store";
import { fetchDesktopSettings, pushDesktopSettings, isPaired } from "./hud-bridge";
import { log } from "../shared/log";
import type { YtbSyncPayload } from "../transport/sync-settings";
import type { YoutubeButlerChannel } from "../storage/schema";

// Offline-capable sync for YouTube Butler's own settings (templates, upload
// cap, visibility, Shorts handling, schedule, etc.), riding the same
// settings.get/settings.push bridge frames as the amazonbutler sync but with
// its own reconcile model: the extension is a remote control for ONE
// canonical desktop engine here, not a two-source merge, so there is no
// "app wins / extension wins" choice to make.
//
// Model: every edit made in the options page writes immediately to local
// storage (optimistic, no pairing gate - same as ordinary extension
// settings) and marks the field's dotted path "pending". A push sends ONLY
// the pending fields (a sparse payload - presence already means explicit
// user intent, so the desktop applies them unconditionally). On success the
// applied paths are cleared from pendingFields. A pull refreshes any field
// NOT currently pending from the desktop's value, so a change made directly
// in the desktop app still shows up; a pending field is left alone until it
// is pushed. Schedule fields are tracked the same way under a "schedule."
// prefix; the desktop's own scheduler accepts either a flat or
// {schedule:{...}} shaped payload, so a push can send flat pending fields
// directly.

const SCHEDULE_PREFIX = "schedule.";

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

// Called by the options page on every YouTube Butler field edit. `path` is
// relative to youtubeButler.settings (e.g. "uploadVisibility",
// "uploadCap.maxPerDay") or, prefixed with "schedule.", relative to
// youtubeButler.schedule (e.g. "schedule.every"). Writes immediately and
// schedules a reconcile attempt; never throws (a closed desktop app is the
// normal case, not an error the UI needs to see synchronously).
export async function patchYtbSetting(path: string, value: unknown): Promise<void> {
  await patchState((s) => {
    if (path.startsWith(SCHEDULE_PREFIX)) {
      setByPath(s.youtubeButler.schedule as unknown as Record<string, unknown>, path.slice(SCHEDULE_PREFIX.length), value);
    } else {
      setByPath(s.youtubeButler.settings as unknown as Record<string, unknown>, path, value);
    }
    if (!s.youtubeButler.pendingFields.includes(path)) {
      s.youtubeButler.pendingFields = [...s.youtubeButler.pendingFields, path];
    }
  });
  scheduleReconcile();
}

// A sparse payload of exactly the pending fields, or null when there is
// nothing to push. Settings fields are projected into a nested shape
// matching the desktop's DEFAULT_SETTINGS (e.g. "uploadCap.maxPerDay" ->
// { uploadCap: { maxPerDay } }); schedule fields are projected flat (the
// desktop's setSchedule accepts a flat payload directly).
export async function buildYtbPushPayload(): Promise<YtbSyncPayload | null> {
  const state = await getState();
  const pending = state.youtubeButler.pendingFields;
  if (!pending.length) return null;

  const settings: Record<string, unknown> = {};
  let schedule: Record<string, unknown> | null = null;
  for (const path of pending) {
    if (path.startsWith(SCHEDULE_PREFIX)) {
      const key = path.slice(SCHEDULE_PREFIX.length);
      const value = getByPath(state.youtubeButler.schedule as unknown as Record<string, unknown>, key);
      schedule = schedule || {};
      schedule[key] = value;
    } else {
      const value = getByPath(state.youtubeButler.settings as unknown as Record<string, unknown>, path);
      setByPath(settings, path, value);
    }
  }
  if (Object.keys(settings).length === 0 && !schedule) return null;
  return { settings, schedule, channel: null };
}

// Flatten the desktop's own scheduler snapshot shape
// ({enabled, schedule:{every,unit,startISO}, armed, nextRunAt, lastRunAt,
// lastError}) into the extension's flat YoutubeButlerSchedule storage shape.
function flattenSchedule(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const inner = raw.schedule && typeof raw.schedule === "object" ? (raw.schedule as Record<string, unknown>) : {};
  return {
    enabled: raw.enabled === true,
    armed: raw.armed === true,
    every: typeof inner.every === "number" ? inner.every : undefined,
    unit: typeof inner.unit === "string" ? inner.unit : undefined,
    startISO: typeof inner.startISO === "string" ? inner.startISO : null,
    nextRunAt: typeof raw.nextRunAt === "number" ? raw.nextRunAt : null,
    lastRunAt: typeof raw.lastRunAt === "number" ? raw.lastRunAt : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : "",
  };
}

// Pulls the desktop's current YouTube Butler state and refreshes every field
// NOT currently pending (a pending field is left alone - the local edit wins
// until it is pushed). Always refreshes the read-only channel display. A
// no-op (not an error) when unpaired or the app is not running, or on an
// older desktop build that never sends a youtubeButler block.
export async function pullYtbSettingsIfAvailable(): Promise<"ok" | "not-paired" | "app-unavailable" | "no-data"> {
  const desktop = await fetchDesktopSettings();
  if (desktop.status !== "ok") return desktop.status;
  const ytb = desktop.payload.youtubeButler;
  if (!ytb) return "no-data";

  await patchState((s) => {
    const pending = new Set(s.youtubeButler.pendingFields);
    const incomingSettings = (ytb.settings || {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(incomingSettings)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "object" && !Array.isArray(value)) {
        const current = (s.youtubeButler.settings as unknown as Record<string, unknown>)[key];
        const merged = current && typeof current === "object" ? { ...current } : {};
        for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
          if (subValue === null || subValue === undefined) continue;
          if (pending.has(`${key}.${subKey}`)) continue;
          (merged as Record<string, unknown>)[subKey] = subValue;
        }
        if (!pending.has(key)) (s.youtubeButler.settings as unknown as Record<string, unknown>)[key] = merged;
      } else if (!pending.has(key)) {
        (s.youtubeButler.settings as unknown as Record<string, unknown>)[key] = value;
      }
    }

    const flatSchedule = flattenSchedule(ytb.schedule as Record<string, unknown> | null | undefined);
    if (flatSchedule) {
      for (const [key, value] of Object.entries(flatSchedule)) {
        if (value === undefined) continue;
        if (pending.has(`schedule.${key}`)) continue;
        (s.youtubeButler.schedule as unknown as Record<string, unknown>)[key] = value;
      }
    }

    if (ytb.channel && typeof ytb.channel === "object") {
      s.youtubeButler.channel = ytb.channel as unknown as YoutubeButlerChannel;
    }
    s.youtubeButler.lastPullAt = Date.now();
  });
  return "ok";
}

// Pushes exactly the pending fields to the desktop app. A no-op when there is
// nothing pending. On success, clears the pending markers and stamps
// lastPushedAt; on failure (unpaired or app not running), stamps
// lastPushError so the options page can show an honest status, and leaves
// the fields pending for the next tick to retry - never throws.
export async function reconcileYtbSettingsPush(): Promise<void> {
  const payload = await buildYtbPushPayload();
  if (!payload) return;
  if (!(await isPaired())) {
    await patchState((s) => {
      s.youtubeButler.lastPushError = "not-paired";
    });
    return;
  }

  try {
    const result = await pushDesktopSettings({ youtubeButler: payload }, "overwrite");
    if (result.status === "ok") {
      await patchState((s) => {
        s.youtubeButler.pendingFields = [];
        s.youtubeButler.lastPushedAt = Date.now();
        s.youtubeButler.lastPushError = null;
      });
      log("youtube-butler-settings", "pushed", { fields: Object.keys(payload.settings).length });
      // Pull right after a successful push so any desktop-computed fields
      // (e.g. the scheduler's armed/nextRunAt) reflect the change immediately.
      await pullYtbSettingsIfAvailable();
    } else {
      await patchState((s) => {
        s.youtubeButler.lastPushError = result.status;
      });
    }
  } catch (err) {
    await patchState((s) => {
      s.youtubeButler.lastPushError = err instanceof Error ? err.message : "push failed";
    });
  }
}

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

// Debounced so several quick edits in the options page collapse into one
// push attempt rather than one per keystroke.
function scheduleReconcile(): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileYtbSettingsPush();
  }, 4000);
}
