/**
 * GET /api/events/list
 * Upcoming scheduled events plus which ones the signed-in user is registered
 * for. Cookie-authenticated.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, listUpcomingEvents, registeredEventIdsForEmail } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const [events, registeredIds] = await Promise.all([
    listUpcomingEvents(admin),
    registeredEventIdsForEmail(admin, user.email),
  ]);

  const items = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    joinUrl: e.joinUrl,
    imageUrl: e.imageUrl,
    registered: registeredIds.has(e.id),
  }));

  return NextResponse.json({ ok: true, events: items });
}
