/**
 * GET /api/admin/events/youtube/connect
 * Kicks off OAuth for the dedicated YouTube account (offline access,
 * youtube.upload scope only) so event recordings publish to a YouTube channel
 * that can be a different Google account from the calls/scheduling calendar.
 * Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requirePermission } from "@/lib/admin";
import { authUrl, isGoogleConfigured, youtubeRedirectUri, YOUTUBE_SCOPES } from "@/lib/google-meet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/admin/events?youtube=notconfigured", request.url));
  }

  const origin = new URL(request.url).origin;
  const state = randomUUID();
  const res = NextResponse.redirect(
    authUrl(origin, state, { scope: YOUTUBE_SCOPES, redirect: youtubeRedirectUri(origin) }),
  );
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
