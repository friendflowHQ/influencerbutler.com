/**
 * GET /api/admin/events/youtube-channel
 * Returns the YouTube channel the connected Google token uploads to, so the
 * admin can confirm the right channel is bound before publishing (an account
 * with several channels binds the OAuth token to exactly one). Gated by
 * events.manage. Read-only.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/events";
import { loadConfig } from "@/lib/scheduling-server";
import { getBoundChannel } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const cfg = await loadConfig(admin);
  // Prefer the dedicated YouTube account; fall back to the calls/scheduling
  // Google token so the bound channel reflects whatever uploads will actually use.
  const usingDedicatedAccount = !!cfg.youtubeRefreshToken;
  const ytToken = cfg.youtubeRefreshToken ?? cfg.googleRefreshToken;
  const accountEmail = usingDedicatedAccount ? cfg.youtubeAccountEmail : cfg.googleCalendarEmail;
  if (!ytToken) {
    return NextResponse.json({ ok: false, connected: false, usingDedicatedAccount, error: "YouTube not connected (no refresh token)." });
  }
  const channel = await getBoundChannel(ytToken);
  if (!channel) {
    return NextResponse.json({
      ok: false,
      connected: true,
      usingDedicatedAccount,
      accountEmail,
      error: "Could not read the connected channel (token invalid or youtube.upload scope missing).",
    });
  }
  return NextResponse.json({
    ok: true,
    connected: true,
    usingDedicatedAccount,
    accountEmail,
    channel,
    target: process.env.YOUTUBE_TARGET_CHANNEL || null,
  });
}
