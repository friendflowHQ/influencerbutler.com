/**
 * GET /api/admin/scheduling/google/connect
 * Kicks off the owner's Google Calendar OAuth (offline access) so we can create
 * Google Meet links per booking. Gated by scheduling.manage.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requirePermission } from "@/lib/admin";
import { authUrl, isGoogleConfigured } from "@/lib/google-meet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/admin/scheduling?google=notconfigured", request.url));
  }

  const origin = new URL(request.url).origin;
  const state = randomUUID();
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
