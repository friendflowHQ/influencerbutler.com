/**
 * GET /api/booking/slots?type=support|demo
 * Available slots for the signed-in customer across the booking horizon.
 * Server recomputes availability (never trusts the client).
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin, availabilityWithTypes } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { setupWalkthroughSkipped, SETUP_REQUIRED_MESSAGE } from "@/lib/setup-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Dual-mode auth so the in-chat booking card works from the website cookie AND
  // from the desktop app / Chrome extension / phone (license-key bearer).
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const type = new URL(request.url).searchParams.get("type");
  if (type !== "support" && type !== "demo") {
    return NextResponse.json({ error: "Bad type" }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  // Each slot carries `types`: every call type open at that start (for the badge).
  const [days, setupRequired] = await Promise.all([
    availabilityWithTypes(admin, type as CallTypeKey, Date.now()),
    setupWalkthroughSkipped(admin, authed.auth.email),
  ]);
  return NextResponse.json({
    callType: type,
    userMinutes: CALL_TYPES[type as CallTypeKey].userMinutes,
    days,
    // A skipped in-app setup blocks booking (create/route.ts); the page shows
    // this note instead of the calendar. Times are still listed for callers
    // that ignore the flag; the create route is the real gate.
    setupRequired,
    setupRequiredMessage: setupRequired ? SETUP_REQUIRED_MESSAGE : null,
  });
}
