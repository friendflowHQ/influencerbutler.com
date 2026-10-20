/**
 * GET /api/booking/slots?type=support|demo
 * Available slots for the signed-in customer across the booking horizon.
 * Server recomputes availability (never trusts the client).
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin, availabilityForType } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";

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

  const days = await availabilityForType(admin, type as CallTypeKey, Date.now());
  return NextResponse.json({
    callType: type,
    userMinutes: CALL_TYPES[type as CallTypeKey].userMinutes,
    days,
  });
}
