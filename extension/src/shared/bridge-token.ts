// The pairing token the background's hud-bridge writes to chrome.storage.local
// once the desktop app is paired. Any extension-context page (popup, onboarding)
// can read it directly to tell whether the app is currently paired, without a
// round-trip to the background. Kept in sync with TOKEN_KEY in
// src/background/hud-bridge.ts.
export const BRIDGE_TOKEN_KEY = "ib-bridge-token";

// When the current pairing was made (ms epoch), written next to the token.
// Kept in sync with PAIRED_AT_KEY in src/background/hud-bridge.ts.
export const BRIDGE_PAIRED_AT_KEY = "ib-bridge-paired-at";

// When settings last synced with the desktop app in either direction (ms
// epoch), written by the background on every successful sync: the automatic
// push when a setting changes, the fill pass on popup open / pairing, and the
// explicit "Sync now". Kept in sync with LAST_SYNC_KEY in
// src/background/settings-sync.ts.
export const BRIDGE_LAST_SYNC_KEY = "ib-bridge-last-sync";

export async function isPairedLocal(): Promise<boolean> {
  try {
    const out = await chrome.storage.local.get(BRIDGE_TOKEN_KEY);
    const token = out?.[BRIDGE_TOKEN_KEY];
    return typeof token === "string" && token.length > 0;
  } catch {
    return false;
  }
}

async function readTimestamp(key: string): Promise<number | null> {
  try {
    const out = await chrome.storage.local.get(key);
    const value = out?.[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

// Null for installs paired before the timestamp shipped (the token exists but
// no paired-at was recorded); callers simply omit the "connected since" line.
export async function getPairedAt(): Promise<number | null> {
  return readTimestamp(BRIDGE_PAIRED_AT_KEY);
}

export async function getLastSyncAt(): Promise<number | null> {
  return readTimestamp(BRIDGE_LAST_SYNC_KEY);
}
