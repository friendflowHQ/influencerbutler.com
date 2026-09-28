// The pairing token the background's hud-bridge writes to chrome.storage.local
// once the desktop app is paired. Any extension-context page (popup, onboarding)
// can read it directly to tell whether the app is currently paired, without a
// round-trip to the background. Kept in sync with TOKEN_KEY in
// src/background/hud-bridge.ts.
export const BRIDGE_TOKEN_KEY = "ib-bridge-token";

export async function isPairedLocal(): Promise<boolean> {
  try {
    const out = await chrome.storage.local.get(BRIDGE_TOKEN_KEY);
    const token = out?.[BRIDGE_TOKEN_KEY];
    return typeof token === "string" && token.length > 0;
  } catch {
    return false;
  }
}
