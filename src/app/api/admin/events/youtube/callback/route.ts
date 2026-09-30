/**
 * GET /api/admin/events/youtube/callback?code=&state=
 * Completes the dedicated YouTube-account OAuth: verifies state, exchanges the
 * code, and stores the refresh token in call_config.youtube_refresh_token (kept
 * separate from the calls/scheduling google_refresh_token). Gated by
 * events.manage.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { exchangeCode, youtubeRedirectUri } from "@/lib/google-meet";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/dashboard/admin/events?youtube=${status}`, request.url));
}

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("yt_oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) return back(request, "error");

  const tok = await exchangeCode(code, url.origin, youtubeRedirectUri(url.origin));
  if (!tok) return back(request, "error");

  const admin = getAdmin();
  if (!admin) return back(request, "error");
  const { error } = await admin
    .from("call_config")
    .update({ youtube_refresh_token: tok.refreshToken, youtube_account_email: tok.email, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) { console.error("[events/youtube/callback] store", error.message); return back(request, "error"); }

  await logAdminAction({ actor, action: "events.youtube.connect", targetType: "call_config", targetId: "1", details: { email: tok.email } });
  const res = back(request, "connected");
  res.cookies.set("yt_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
