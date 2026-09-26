// Platform detection for Android extension browsers (Lemur and other
// Chromium-based mobile browsers that install Chrome Web Store extensions).
//
// One build ships everywhere; the few desktop-only behaviors (the loopback
// bridge to the desktop app, hidden background tabs, popup windows, the
// right-click menu) check this at runtime instead of forking a mobile build.
//
// Two flavors because the reliable signal differs by context:
// - isAndroid(): background worker and extension pages. Uses
//   chrome.runtime.getPlatformInfo (no permission needed), cached per worker.
// - isMobileUserAgent(): synchronous, safe in content scripts (which cannot
//   call getPlatformInfo). Reads navigator.userAgentData, then the UA string.

let cachedAndroid: Promise<boolean> | null = null;

/** True when the browser runs on Android. Never throws; false when unknown. */
export function isAndroid(): Promise<boolean> {
  if (!cachedAndroid) {
    cachedAndroid = (async () => {
      try {
        const info = await chrome.runtime.getPlatformInfo();
        if (info?.os) return info.os === "android";
      } catch {
        // Not available in this context (or a browser that omits it): fall
        // back to the user agent below.
      }
      return isMobileUserAgent();
    })();
  }
  return cachedAndroid;
}

interface UserAgentDataLike {
  mobile?: boolean;
  platform?: string;
}

/** Synchronous best-effort check, for content scripts and first paint. */
export function isMobileUserAgent(): boolean {
  try {
    const nav = globalThis.navigator as (Navigator & { userAgentData?: UserAgentDataLike }) | undefined;
    if (!nav) return false;
    const data = nav.userAgentData;
    if (data) {
      if (data.platform && /android/i.test(data.platform)) return true;
      if (typeof data.mobile === "boolean") return data.mobile;
    }
    return /Android/i.test(nav.userAgent ?? "");
  } catch {
    return false;
  }
}

/** Test hook: forget the cached answer. */
export function resetPlatformCacheForTests(): void {
  cachedAndroid = null;
}
