/**
 * GET /api/announcements?surface=desktop
 *
 * Public, cross-app announcement feed. Returns the currently-active event
 * banners for a client surface (desktop app, or web/extension if asked). The
 * desktop Electron app polls this on an interval to show an event banner.
 * Public (no auth): these are operational announcements, not user data.
 * Edge-cached briefly with a content-hash ETag, like /api/extension/flags, so a
 * scheduled banner appears within minutes without hammering the function.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdmin, activeBanners, type BannerSurface } from "@/lib/events";
import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

function parseSurface(raw: string | null): BannerSurface {
  if (raw === "web" || raw === "extension" || raw === "desktop") return raw;
  return "desktop";
}

export async function GET(request: Request) {
  const surface = parseSurface(new URL(request.url).searchParams.get("surface"));

  const admin = getAdmin();
  let banners: Array<{ id: string; text: string; ctaLabel: string | null; ctaUrl: string; startsAt: string; endsAt: string | null }> = [];
  if (admin) {
    try {
      banners = await activeBanners(admin, surface);
    } catch (e) {
      console.error("[announcements] failed", e);
    }
  }

  const payload = { banners };
  const version = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  const etag = `"ann-${surface}-${version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...corsHeaders(), ETag: etag } });
  }

  const res = jsonWithCors(payload, 200);
  res.headers.set("ETag", etag);
  res.headers.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  return res;
}
