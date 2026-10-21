/**
 * POST /api/events/call-offers/claim
 * Body: { offerId: string, eventId: string, timezone?: string, name?: string }
 * Claims an open 1:1 follow-up call offer - only for a signed-in, active
 * registrant of that event. Books it as a real call (Meet link, Recall bot,
 * confirmation email) exactly like the public booking flow from here on.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, claimEventCallOffer } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { offerId?: string; eventId?: string; timezone?: string; name?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const offerId = (body.offerId || "").trim();
  const eventId = (body.eventId || "").trim();
  if (!offerId || !eventId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const name = (body.name || "").trim().slice(0, 200) || null;
  const timezone = (body.timezone || "").trim().slice(0, 64) || null;

  const result = await claimEventCallOffer(admin, {
    offerId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    userName: name,
    userTimezone: timezone,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, bookingId: result.bookingId, joinUrl: result.joinUrl });
}
