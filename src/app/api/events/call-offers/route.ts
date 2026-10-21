/**
 * GET /api/events/call-offers?eventId=
 * Open 1:1 follow-up call times for an event, visible only to the signed-in
 * user if they are an active registrant of that event.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, listOpenOffersForRegistrant } from "@/lib/event-call-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const eventId = (new URL(request.url).searchParams.get("eventId") || "").trim();
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const result = await listOpenOffersForRegistrant(admin, eventId, user.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });

  return NextResponse.json({ ok: true, offers: result.offers });
}
