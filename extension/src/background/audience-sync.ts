import { fetchDesktopSettings, isPaired } from "./hud-bridge";
import { AUDIENCE_PROFILE_KEY } from "../shared/audience-profile";

// Periodic refresh of the cached audience profile (see shared/audience-profile).
// fetchDesktopSettings itself writes the cache on every successful pull, so this
// only has to trigger a pull now and then. Throttled because settings.get also
// reads credentials on the app side; a no-op when the app was never paired, so
// the card keeps working (product signals only) without the app.

const REFRESH_EVERY_MS = 30 * 60 * 1000;
let lastAttemptAt = 0;

export async function refreshAudienceProfile(now: number = Date.now()): Promise<void> {
  if (now - lastAttemptAt < REFRESH_EVERY_MS) return;
  try {
    const got = await chrome.storage.local.get(AUDIENCE_PROFILE_KEY);
    const at = Number((got?.[AUDIENCE_PROFILE_KEY] as { at?: number } | undefined)?.at) || 0;
    if (now - at < REFRESH_EVERY_MS) return;
  } catch {
    // fall through and try a pull
  }
  lastAttemptAt = now;
  if (!(await isPaired())) return;
  await fetchDesktopSettings();
}

// Test hook.
export function resetAudienceRefreshForTest(): void {
  lastAttemptAt = 0;
}
