import { GENERATIONS, type Generation } from "./shopper-generation";

// The creator's audience profile ({boomer, genx, millennial, genz} percents),
// set in the desktop app's Product Research and pulled over the paired bridge's
// settings.get frame. Cached in extension storage so the "Who buys this" card can
// lean its estimate the same way the desktop does, even when the app is closed.
// Not a secret. Absent when never paired, or the creator never set one.

export type AudienceProfile = Record<Generation, number>;

export const AUDIENCE_PROFILE_KEY = "ib-audience-profile";

// Keep only the four generation percents (finite, 0 to 100). Null when nothing
// positive is left, so a malformed or empty answer never tunes the card.
export function coerceAudienceProfile(raw: unknown): AudienceProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = {} as AudienceProfile;
  let total = 0;
  for (const g of GENERATIONS) {
    const n = Number(o[g]);
    const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    out[g] = v;
    total += v;
  }
  return total > 0 ? out : null;
}

export async function loadAudienceProfile(): Promise<AudienceProfile | null> {
  try {
    const got = await chrome.storage.local.get(AUDIENCE_PROFILE_KEY);
    const entry = got?.[AUDIENCE_PROFILE_KEY] as { profile?: unknown } | undefined;
    return coerceAudienceProfile(entry?.profile);
  } catch {
    return null;
  }
}

// Null clears the cache (the creator removed their profile in the app).
export async function saveAudienceProfile(profile: AudienceProfile | null): Promise<void> {
  try {
    if (profile) {
      await chrome.storage.local.set({ [AUDIENCE_PROFILE_KEY]: { profile, at: Date.now() } });
    } else {
      await chrome.storage.local.remove(AUDIENCE_PROFILE_KEY);
    }
  } catch {
    // best effort: the card just keeps the previous profile (or none)
  }
}
