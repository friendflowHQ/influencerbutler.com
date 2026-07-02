import {
  WINDOWS_DOWNLOAD_URL,
  MAC_RELEASES_BASE,
  DESKTOP_APP_VERSION,
} from "@/lib/welcome-copy";

/**
 * Resolves always-current installer URLs for the desktop app.
 *
 * Windows is easy: dl.influencerbutler.com (Cloudflare) redirects every request
 * to the newest .exe, so the URL never changes. The Mac release feed has no
 * such alias - installer filenames are version-pinned
 * (InfluencerButler-<version>-<arch>.dmg) and the desktop app releases faster
 * than this site redeploys, so a hardcoded version drifts and the links 404.
 * Instead we read the current version from the feed's latest-mac.yml, cached
 * in-module for a few minutes, and fall back to the pinned DESKTOP_APP_VERSION
 * (or the last good value) if the feed is unreachable.
 *
 * Used by /api/trial/start (the tracked /go/download redirect) and /dl/* (the
 * evergreen shareable links).
 */

const MAC_VERSION_TTL_MS = 5 * 60 * 1000;
let macVersionCache: { version: string; fetchedAt: number } | null = null;

export async function latestMacVersion(): Promise<string> {
  const now = Date.now();
  if (macVersionCache && now - macVersionCache.fetchedAt < MAC_VERSION_TTL_MS) {
    return macVersionCache.version;
  }
  try {
    const res = await fetch(`${MAC_RELEASES_BASE}/latest-mac.yml`, { cache: "no-store" });
    if (res.ok) {
      const match = (await res.text()).match(/^version:\s*(\S+)/m);
      if (match) {
        macVersionCache = { version: match[1], fetchedAt: now };
        return match[1];
      }
    } else {
      console.error("desktop-downloads: latest-mac.yml fetch failed", res.status);
    }
  } catch (error) {
    console.error("desktop-downloads: latest-mac.yml fetch error", error);
  }
  return macVersionCache?.version ?? DESKTOP_APP_VERSION;
}

export function macDownloadUrl(version: string, arch: "arm64" | "x64"): string {
  return `${MAC_RELEASES_BASE}/InfluencerButler-${version}-${arch}.dmg`;
}

export async function currentMacDownloadUrl(arch: "arm64" | "x64"): Promise<string> {
  return macDownloadUrl(await latestMacVersion(), arch);
}

export { WINDOWS_DOWNLOAD_URL };
