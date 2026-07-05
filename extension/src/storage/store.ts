import { DEFAULTS, migrate, type Settings, type StorageShape } from "./schema";

// Typed access to chrome.storage.local. The whole state lives under one key
// so migrate() can reason about it as a unit.
const KEY = "ib";

export async function getState(): Promise<StorageShape> {
  const raw = await chrome.storage.local.get(KEY);
  return migrate(raw[KEY]);
}

export async function setState(state: StorageShape): Promise<void> {
  await chrome.storage.local.set({ [KEY]: state });
}

export async function patchState(patch: (state: StorageShape) => void): Promise<StorageShape> {
  const state = await getState();
  patch(state);
  await setState(state);
  return state;
}

export async function getSettings(): Promise<Settings> {
  return (await getState()).settings;
}

export async function patchSettings(partial: Partial<Settings>): Promise<Settings> {
  const state = await patchState((s) => {
    s.settings = { ...s.settings, ...partial };
  });
  return state.settings;
}

export function onStateChange(handler: (state: StorageShape) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) {
      handler(migrate(changes[KEY].newValue));
    }
  });
}

export { DEFAULTS };
