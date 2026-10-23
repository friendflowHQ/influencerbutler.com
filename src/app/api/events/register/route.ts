/**
 * POST /api/events/register
 * Body: { eventId: string, timezone?: string, name?: string }
 * Registers the signed-in user for an event (RSVP), capturing their email
 * server-side from the session (never from the body, matching
 * booking/create), then emails a confirmation with a .ics invite. The event
 * may already have happened - registering after the fact is allowed on
 * purpose, see the comment below. The email is best-effort and never fails
 * the registration.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, getEvent } from "@/lib/events";
import { sendEventRegistrationConfirmation } from "@/lib/event-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { eventId?: string; timezone?: string; name?: string };

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

  const eventId = (body.eventId || "").trim();
  if (!eventId) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, eventId);
  if (!event || event.status !== "scheduled") {
    return NextResponse.json({ error: "That event is not open for registration." }, { status: 404 });
  }
  // Registering after the event already happened is allowed on purpose - the
  // direct share link is also how someone who attended live (e.g. from a
  // partner's Facebook group) without pre-registering gets added afterward,
  // which is what makes them eligible for anything gated on registration
  // (private 1:1 follow-up calls, the replay email).

  const name = (body.name || "").trim().slice(0, 200) || null;
  const timezone = (body.timezone || "").trim().slice(0, 64) || null;

  const { error } = await admin.from("event_registrations").upsert(
    {
      event_id: eventId,
      user_id: user.id,
      user_email: user.email,
      user_name: name,
      user_timezone: timezone,
      registered_at: new Date().toISOString(),
      cancelled_at: null,
    },
    { onConflict: "event_id,user_email" },
  );
  if (error) {
    console.error("[events/register] upsert", error.message);
    return NextResponse.json({ error: "Could not register." }, { status: 500 });
  }

  // Best-effort confirmation email with a calendar invite.
  try {
    await sendEventRegistrationConfirmation({
      id: event.id,
      title: event.title,
      description: event.description,
      startMs: Date.parse(event.startsAt),
      endMs: Date.parse(event.endsAt),
      joinUrl: event.joinUrl,
      toEmail: user.email,
      toName: name,
      timezone: timezone || event.timezone,
      imageUrl: event.imageUrl,
    });
  } catch (e) {
    console.error("[events/register] confirm email", e);
  }

  return NextResponse.json({ ok: true });
}
