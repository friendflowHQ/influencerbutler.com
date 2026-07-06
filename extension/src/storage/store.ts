import {
  DEFAULTS,
  DEFAULT_INTEGRATION_STATE,
  migrate,
  type IntegrationsState,
  type IntegrationState,
  type Settings,
  type StorageShape,
} from "./schema";

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

export async function getIntegrations(): Promise<IntegrationsState> {
  return (await getState()).integrations;
}

// One provider's stored state, backfilled with defaults so callers never have
// to null-check a provider that has not been configured yet.
export async function getIntegration(id: string): Promise<IntegrationState> {
  const { providers } = await getIntegrations();
  return { ...DEFAULT_INTEGRATION_STATE, ...(providers[id] ?? {}) };
}

export async function patchIntegration(
  id: string,
  patch: (state: IntegrationState) => void,
): Promise<IntegrationState> {
  let next!: IntegrationState;
  await patchState((s) => {
    const current = { ...DEFAULT_INTEGRATION_STATE, ...(s.integrations.providers[id] ?? {}) };
    patch(current);
    s.integrations.providers[id] = current;
    next = current;
  });
  return next;
}

export async function patchIntegrationsGlobal(
  partial: Partial<IntegrationsState["global"]>,
): Promise<IntegrationsState["global"]> {
  const state = await patchState((s) => {
    s.integrations.global = { ...s.integrations.global, ...partial };
  });
  return state.integrations.global;
}

export function onStateChange(handler: (state: StorageShape) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) {
      handler(migrate(changes[KEY].newValue));
    }
  });
}

export { DEFAULTS };
