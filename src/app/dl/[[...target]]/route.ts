import { NextResponse } from "next/server";
import {
  WINDOWS_DOWNLOAD_URL,
  currentMacDownloadUrl,
} from "@/lib/desktop-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evergreen download links - the Mac counterpart of dl.influencerbutler.com.
 *
 * dl.influencerbutler.com always redirects to the newest Windows .exe, so it
 * can be pasted into emails, DMs, and support replies without ever going
 * stale. Mac had no equivalent: the .dmg filenames are version-pinned. These
 * routes fill that gap by resolving the current version from the release
 * feed's latest-mac.yml on every request (see src/lib/desktop-downloads.ts):
 *
 *   /dl/win        -> newest Windows .exe (via dl.influencerbutler.com)
 *   /dl/mac        -> newest Apple Silicon (arm64) .dmg
 *   /dl/mac-arm    -> alias of /dl/mac
 *   /dl/mac-intel  -> newest Intel (x64) .dmg
 *   /dl (or other) -> the /download chooser page
 *
 * Unlike /go/download these do NOT send a trial-click notification or log a
 * recent-activity entry, so they are safe to use for reinstalls and support
 * without skewing trial stats. On-site CTAs should keep using /go/download.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ target?: string[] }> },
) {
  const segments = (await params).target ?? [];
  const target = segments.join("/").toLowerCase();

  const destination = await resolveDestination(target, request);
  const redirect = NextResponse.redirect(destination, 302);
  // Never let the CDN cache the redirect - the Mac target changes per release.
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}

async function resolveDestination(target: string, request: Request): Promise<string> {
  switch (target) {
    case "win":
    case "windows":
      return WINDOWS_DOWNLOAD_URL;
    case "mac":
    case "mac-arm":
      return currentMacDownloadUrl("arm64");
    case "mac-intel":
      return currentMacDownloadUrl("x64");
  }
  // Bare /dl or an unrecognized target: send them to the chooser page.
  return `${publicBaseUrl(request)}/download`;
}

// Behind Vercel's proxy, new URL(request.url).origin can be an internal host,
// so prefer the forwarded host/proto when building the /download redirect.
function publicBaseUrl(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
