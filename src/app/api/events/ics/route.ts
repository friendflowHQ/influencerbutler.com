/**
 * GET /api/events/ics?id=<eventId>
 * Returns a downloadable calendar invite (.ics) for an upcoming event, so the
 * "Add to calendar" button works without waiting for the confirmation email.
 * Cookie-authenticated.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, getEvent } from "@/lib/events";
import { buildIcs } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZER_EMAIL = "hello@influencerbutler.com";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ics = buildIcs({
    uid: `event-${event.id}@influencerbutler.com`,
    startMs: Date.parse(event.startsAt),
    endMs: Date.parse(event.endsAt),
    summary: event.title,
    description: [event.description || "", event.joinUrl ? `Join: ${event.joinUrl}` : ""]
      .filter(Boolean)
      .join("\n"),
    location: event.joinUrl || undefined,
    conferenceUrl: event.joinUrl || undefined,
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: user.email,
    method: "REQUEST",
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${event.id}.ics"`,
    },
  });
}
